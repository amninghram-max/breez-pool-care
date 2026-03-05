import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { Resend } from 'npm:resend@4.0.0';

/**
 * scheduleNewCustomer
 * Called after activation payment succeeds.
 * 1. Finds the best service day for the new customer by grouping nearby addresses.
 * 2. Creates first + recurring CalendarEvents for the assigned day.
 * 3. Sends a service scheduled confirmation email.
 * 4. Uses ZIP code proximity (same ZIP first, then neighboring ZIPs) as a fast
 *    proxy for route grouping when lat/lng are not available.
 */

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

/** Return YYYY-MM-DD strings for the next N weeks on a given weekday (0=Sun..6=Sat) */
function getWeeklyDates(startDayOfWeek, weeks) {
  const dates = [];
  const today = new Date();
  // advance to the target weekday, at least 2 days from now
  const d = new Date(today);
  d.setDate(d.getDate() + 2);
  while (d.getDay() !== startDayOfWeek) {
    d.setDate(d.getDate() + 1);
  }
  for (let i = 0; i < weeks; i++) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + i * 7);
    dates.push(copy.toISOString().split('T')[0]);
  }
  return dates;
}

/** Simple ZIP-based proximity: same ZIP = 0, off by 1 = 1, etc. */
function zipProximity(zip1, zip2) {
  if (!zip1 || !zip2) return 999;
  if (zip1 === zip2) return 0;
  return Math.abs(parseInt(zip1, 10) - parseInt(zip2, 10));
}

/** Extract ZIP from an address string or lead.zipCode */
function extractZip(lead) {
  if (lead.zipCode) return lead.zipCode;
  const m = (lead.serviceAddress || '').match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

/** Find the best day-of-week for the new customer based on where existing events cluster */
async function findBestDayOfWeek(newLeadZip, base44) {
  // Look at active service events in the next 14 days
  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 14);
  const futureDateStr = futureDate.toISOString().split('T')[0];

  const events = await base44.asServiceRole.entities.CalendarEvent.filter(
    { eventType: 'service', status: 'scheduled' },
    'scheduledDate',
    200
  );

  // Filter to next 14 days
  const relevant = events.filter(e => e.scheduledDate >= today && e.scheduledDate <= futureDateStr);

  if (relevant.length === 0) {
    // No existing events — default to Monday
    return 1; // Monday
  }

  // Gather lead IDs to fetch their ZIPs
  const uniqueLeadIds = [...new Set(relevant.map(e => e.leadId))];
  const leadZipMap = {};
  // Batch fetch leads (up to 50 at a time to avoid timeouts)
  const batchSize = 20;
  for (let i = 0; i < Math.min(uniqueLeadIds.length, 60); i += batchSize) {
    const batch = uniqueLeadIds.slice(i, i + batchSize);
    await Promise.all(batch.map(async (lid) => {
      try {
        const l = await base44.asServiceRole.entities.Lead.get(lid);
        if (l) leadZipMap[lid] = extractZip(l);
      } catch (_) { /* ignore */ }
    }));
  }

  // For each day-of-week, compute average proximity to new customer
  const dayScores = {}; // dayOfWeek -> { totalProx, count }
  for (const ev of relevant) {
    const date = new Date(ev.scheduledDate + 'T00:00:00');
    const dow = date.getDay(); // 0=Sun
    if (dow === 0) continue; // skip Sunday
    const evZip = leadZipMap[ev.leadId];
    const prox = zipProximity(newLeadZip, evZip);
    if (!dayScores[dow]) dayScores[dow] = { totalProx: 0, count: 0 };
    dayScores[dow].totalProx += prox;
    dayScores[dow].count += 1;
  }

  // Find day with lowest average proximity (most nearby neighbors)
  let bestDay = 1; // default Monday
  let bestAvg = Infinity;
  for (const [dow, score] of Object.entries(dayScores)) {
    const avg = score.totalProx / score.count;
    if (avg < bestAvg) {
      bestAvg = avg;
      bestDay = parseInt(dow, 10);
    }
  }

  return bestDay;
}

/** Get position in route for the new stop (after existing stops that day) */
async function getRoutePosition(scheduledDate, technician, base44) {
  const events = await base44.asServiceRole.entities.CalendarEvent.filter(
    { scheduledDate, assignedTechnician: technician, eventType: 'service' },
    'routePosition',
    100
  );
  const positions = events.map(e => e.routePosition || 0).filter(Boolean);
  return positions.length > 0 ? Math.max(...positions) + 1 : 1;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId } = await req.json();

    if (!leadId) {
      return Response.json({ error: 'Lead ID required' }, { status: 400 });
    }

    const lead = await base44.asServiceRole.entities.Lead.get(leadId);
    if (!lead) {
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Idempotency: skip if active service events already exist
    const existingEvents = await base44.asServiceRole.entities.CalendarEvent.filter(
      { leadId, eventType: 'service', status: 'scheduled' },
      '-created_date',
      10
    );
    const todayStr = new Date().toISOString().split('T')[0];
    const activeEvents = (existingEvents || []).filter(e => e.scheduledDate >= todayStr);
    if (activeEvents.length > 0) {
      console.log(`[scheduleNewCustomer] Already has ${activeEvents.length} service events for leadId=${leadId}`);
      return Response.json({ success: true, alreadyScheduled: true, eventCount: activeEvents.length });
    }

    // Determine frequency from accepted quote or lead data
    let frequency = 'weekly';
    if (lead.acceptedQuoteId) {
      try {
        const quote = await base44.asServiceRole.entities.Quote.get(lead.acceptedQuoteId);
        if (quote?.outputFrequency) frequency = quote.outputFrequency;
      } catch (_) {}
    }

    const newLeadZip = extractZip(lead);
    const technician = lead.assignedInspector || 'Matt';
    const serviceAddress = lead.serviceAddress || `${lead.streetAddress || ''}, ${lead.city || ''}, ${lead.state || ''} ${lead.zipCode || ''}`.trim();

    // Find the best day-of-week based on nearby route clustering
    const bestDow = await findBestDayOfWeek(newLeadZip, base44);
    console.log(`[scheduleNewCustomer] Best day for leadId=${leadId} (zip=${newLeadZip}): ${DAYS[bestDow]}`);

    // Generate recurring dates on that weekday
    const weeks = frequency === 'twice_weekly' ? 8 : 4;
    const serviceDates = getWeeklyDates(bestDow, weeks);

    if (serviceDates.length === 0) {
      return Response.json({ error: 'Could not compute service dates' }, { status: 500 });
    }

    // Create calendar events
    const events = [];
    for (const date of serviceDates) {
      const routePos = await getRoutePosition(date, technician, base44);
      const event = await base44.asServiceRole.entities.CalendarEvent.create({
        leadId,
        eventType: 'service',
        scheduledDate: date,
        timeWindow: '8:00 AM - 5:00 PM',
        startTime: '09:00',
        endTime: '10:00',
        estimatedDuration: 30,
        assignedTechnician: technician,
        status: 'scheduled',
        serviceAddress,
        accessNotes: lead.gateCode ? `Gate code: ${lead.gateCode}` : '',
        isRecurring: true,
        recurrencePattern: frequency === 'twice_weekly' ? 'biweekly' : 'weekly',
        routePosition: routePos,
      });
      events.push(event);
    }

    // Update lead to converted
    await base44.asServiceRole.entities.Lead.update(leadId, {
      stage: 'converted',
      accountStatus: 'active',
    });

    // Send confirmation email
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    const firstName = lead.firstName || 'there';
    const firstDate = serviceDates[0];
    const formattedDate = new Date(firstDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const TEAL = '#1B9B9F';

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:${TEAL};padding:32px 40px;text-align:center;">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png" alt="Breez Pool Care" height="48" style="display:block;margin:0 auto 16px;" />
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Your First Service is Scheduled! 🏊</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0;font-size:16px;">Hi <strong>${firstName}</strong>,</p>
            <p style="margin:12px 0 0;font-size:15px;color:#374151;line-height:1.7;">Your first pool service has been scheduled. Here are the details:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background:#f0fdfd;border:2px solid ${TEAL};border-radius:12px;">
              <tr><td style="padding:20px;">
                <p style="margin:0 0 8px;font-size:15px;"><strong>📅 First Service Date:</strong> ${formattedDate}</p>
                <p style="margin:0 0 8px;font-size:15px;"><strong>🔄 Frequency:</strong> ${frequency === 'twice_weekly' ? 'Twice Weekly' : 'Weekly'}</p>
                <p style="margin:0 0 8px;font-size:15px;"><strong>👷 Technician:</strong> ${technician}</p>
                <p style="margin:0;font-size:15px;"><strong>📍 Address:</strong> ${serviceAddress}</p>
              </td></tr>
            </table>
            <h3 style="margin:24px 0 12px;font-size:15px;font-weight:700;">Before your first visit:</h3>
            <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:2;">
              <li>Ensure the pool area is accessible</li>
              <li>Secure any pets during service</li>
              <li>Have your gate code ready if applicable</li>
            </ul>
            <p style="margin:24px 0 0;font-size:14px;color:#374151;">We'll notify you when our technician is on the way. Questions? Call <strong>(321) 524-3838</strong>.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:20px 0 0;font-size:13px;color:#6b7280;"><strong style="color:#374151;">Breez Pool Care LLC</strong> · (321) 524-3838 · <a href="https://breezpoolcare.com" style="color:${TEAL};text-decoration:none;">breezpoolcare.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await resend.emails.send({
        from: 'Breez Pool Care <noreply@breezpoolcare.com>',
        to: lead.email,
        subject: `Your first Breez service is scheduled — ${formattedDate}`,
        html: emailHtml,
        text: `Hi ${firstName},\n\nYour first pool service is scheduled for ${formattedDate} (${frequency === 'twice_weekly' ? 'Twice Weekly' : 'Weekly'}).\n\nTechnician: ${technician}\nAddress: ${serviceAddress}\n\nWe'll notify you when we're on the way.\n\n— Breez Pool Care\n(321) 524-3838`
      });
      console.log(`[scheduleNewCustomer] Confirmation email sent to ${lead.email}`);
    } catch (emailErr) {
      console.warn('[scheduleNewCustomer] Email failed:', emailErr.message);
    }

    // Analytics
    await base44.asServiceRole.entities.AnalyticsEvent.create({
      eventType: 'ServiceVisitScheduled',
      leadId,
      technicianName: technician,
      source: 'system',
      metadata: { first_service_date: firstDate, frequency, events_created: events.length, scheduled_day: DAYS[bestDow] },
      timestamp: new Date().toISOString()
    });

    console.log(`[scheduleNewCustomer] ✅ leadId=${leadId}, day=${DAYS[bestDow]}, dates=${serviceDates.join(', ')}`);

    return Response.json({
      success: true,
      leadId,
      firstServiceDate: serviceDates[0],
      scheduledDayOfWeek: DAYS[bestDow],
      frequency,
      eventCount: events.length,
      upcomingDates: serviceDates.slice(0, 4),
    });

  } catch (error) {
    console.error('[scheduleNewCustomer] error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});