import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { Resend } from 'npm:resend@4.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

function getAppOrigin(req) {
  const envUrl = Deno.env.get('PUBLIC_APP_URL');
  if (envUrl) return envUrl.replace(/\/$/, '');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || '';
  return `${proto}://${host}`;
}

function buildHtmlEmail({ firstName, dateFormatted, timeWindow, inspectorName, inspectorTitle, phone, website, serviceArea, rescheduleUrl }) {
  const TEAL = '#1B9B9F';
  const LIGHT_TEAL = '#e8f8f9';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Inspection Confirmed — Breez Pool Care</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;color:#1f2937;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${TEAL};padding:32px 40px;text-align:center;">
              <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
                   alt="Breez Pool Care" height="48" style="display:block;margin:0 auto 16px;" />
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                Inspection Confirmed ✓
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                Your free pool inspection is booked
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0;font-size:16px;color:#1f2937;line-height:1.6;">
                Hi <strong>${firstName}</strong>,
              </p>
              <p style="margin:12px 0 0;font-size:15px;color:#374151;line-height:1.7;">
                This is a confirmation that your <strong>free pool inspection</strong> with <strong>Breez Pool Care</strong> is scheduled for:
              </p>
            </td>
          </tr>

          <!-- Appointment Card -->
          <tr>
            <td style="padding:20px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_TEAL};border:2px solid ${TEAL};border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 28px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:14px;border-bottom:1px solid rgba(27,155,159,0.2);">
                          <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Date</p>
                          <p style="margin:0;font-size:17px;font-weight:700;color:#1f2937;">${dateFormatted}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px 0;border-bottom:1px solid rgba(27,155,159,0.2);">
                          <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Arrival Window</p>
                          <p style="margin:0;font-size:17px;font-weight:700;color:#1f2937;">${timeWindow}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:14px;">
                          <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEAL};">Inspector</p>
                          <p style="margin:0;font-size:17px;font-weight:700;color:#1f2937;">${inspectorName}${inspectorTitle ? ', <span style="font-weight:400;font-size:15px;color:#4b5563;">' + inspectorTitle + '</span>' : ''}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What to Expect -->
          <tr>
            <td style="padding:4px 40px 0;">
              <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">What to expect</h2>
              <p style="margin:0 0 10px;font-size:14px;color:#374151;">During the visit, we'll:</p>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr><td style="padding:5px 0;font-size:14px;color:#374151;line-height:1.6;">
                  <span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>
                  <strong>Test your water</strong> and review basic water balance
                </td></tr>
                <tr><td style="padding:5px 0;font-size:14px;color:#374151;line-height:1.6;">
                  <span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>
                  <strong>Inspect your pool equipment</strong> (pump, filter, timer, valves, etc.)
                </td></tr>
                <tr><td style="padding:5px 0;font-size:14px;color:#374151;line-height:1.6;">
                  <span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>
                  Check <strong>circulation and overall system function</strong>
                </td></tr>
                <tr><td style="padding:5px 0;font-size:14px;color:#374151;line-height:1.6;">
                  <span style="color:${TEAL};font-weight:700;margin-right:8px;">•</span>
                  Answer any questions you have and discuss any concerns you've noticed
                </td></tr>
              </table>
              <p style="margin:12px 0 0;font-size:14px;color:#374151;">
                Most inspections take <strong>about 20–30 minutes</strong>, depending on access and equipment layout.
              </p>
            </td>
          </tr>

          <!-- Before we arrive -->
          <tr>
            <td style="padding:24px 40px 0;">
              <h2 style="margin:0 0 10px;font-size:16px;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Before we arrive</h2>
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
                We will <strong>call you about 1 hour before arrival</strong> to confirm that you (or a designated caretaker) will be home and that we can access the pool and equipment area.
              </p>
            </td>
          </tr>

          <!-- No Obligation -->
          <tr>
            <td style="padding:24px 40px 0;">
              <h2 style="margin:0 0 10px;font-size:16px;font-weight:700;color:#1f2937;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">No obligation</h2>
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
                This inspection is <strong>completely free</strong> and there is <strong>no obligation</strong> to sign up for service. Our goal is simply to give you a clear picture of your pool's condition and answer your questions.
              </p>
            </td>
          </tr>

          <!-- Reschedule CTA -->
          ${rescheduleUrl ? `
          <tr>
            <td style="padding:28px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#374151;">Need to change your appointment?</p>
                    <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">If you need to reschedule, use the button below or call/text us.</p>
                    <a href="${rescheduleUrl}"
                       style="display:inline-block;background-color:#ffffff;color:${TEAL};border:2px solid ${TEAL};border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;text-decoration:none;">
                      Reschedule My Inspection
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Divider + Closing -->
          <tr>
            <td style="padding:28px 40px 0;">
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
                If you need to reschedule or update access instructions, reply to this email or call/text us at <strong>${phone}</strong>.
              </p>
              <p style="margin:18px 0 0;font-size:14px;color:#374151;">
                Thank you,<br />
                <strong>Breez Pool Care</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">
                      <strong style="color:#374151;">Breez Pool Care LLC</strong> &nbsp;|&nbsp; ${phone} &nbsp;|&nbsp; <a href="${website}" style="color:${TEAL};text-decoration:none;">${website.replace('https://', '')}</a>
                    </p>
                    <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">${serviceArea}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, firstName, email, inspectionDate, inspectionTime, force, token } = await req.json();

    let lead = null;
    if (leadId) {
      lead = await base44.asServiceRole.entities.Lead.get(leadId).catch(() => null);
    }

    const finalFirstName = lead ? (lead.firstName || 'Customer') : (firstName || 'Customer');
    const finalEmail = (lead ? lead.email : email) || email;
    const finalInspectionDate = inspectionDate || (lead?.confirmedInspectionDate?.split('T')[0]);
    const finalInspectionTime = inspectionTime || 'To be confirmed';
    const finalToken = token || lead?.inspectionEventId || null;

    if (!finalEmail) {
      return Response.json({ error: 'Missing email: provide leadId or email param' }, { status: 400 });
    }

    if (leadId && !force && lead?.inspectionConfirmationSent) {
      console.log(`Confirmation already sent for leadId=${leadId}, skipping.`);
      return Response.json({ success: true, skipped: true, reason: 'already_sent' });
    }

    const dateFormatted = finalInspectionDate
      ? new Date(finalInspectionDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'To be scheduled';

    const appOrigin = getAppOrigin(req);

    // Build reschedule URL using the quote token (passed as `token` param, or look up from QuoteRequests)
    let rescheduleUrl = null;
    if (finalToken) {
      rescheduleUrl = `${appOrigin}/RescheduleInspection?token=${encodeURIComponent(finalToken)}`;
    } else if (leadId) {
      // Try to find the token from QuoteRequests
      try {
        const qrs = await base44.asServiceRole.entities.QuoteRequests.filter({ leadId }, '-created_date', 1);
        if (qrs?.[0]?.token) {
          rescheduleUrl = `${appOrigin}/RescheduleInspection?token=${encodeURIComponent(qrs[0].token)}`;
        }
      } catch (e) {
        console.warn('Could not look up quote token for reschedule link:', e.message);
      }
    }

    const subject = `Inspection Confirmed — ${dateFormatted} · Breez Pool Care`;

    const html = buildHtmlEmail({
      firstName: finalFirstName,
      dateFormatted,
      timeWindow: finalInspectionTime,
      inspectorName: 'Matt Inghram',
      inspectorTitle: 'Owner/Operator',
      phone: '(321) 524-3838',
      website: 'https://breezpoolcare.com',
      serviceArea: 'Space Coast, FL · Mon–Sat 8am–6pm',
      rescheduleUrl,
    });

    // Plain text fallback
    const text = `Hi ${finalFirstName},

This is a confirmation that your free pool inspection with Breez Pool Care is scheduled for:

Date: ${dateFormatted}
Arrival Window: ${finalInspectionTime}
Inspector: Matt Inghram, Owner/Operator

WHAT TO EXPECT
During the visit, we'll test your water, inspect equipment (pump, filter, timer, valves), check circulation, and answer your questions. Most inspections take about 20–30 minutes.

BEFORE WE ARRIVE
We will call you about 1 hour before arrival to confirm access.

NO OBLIGATION
This inspection is completely free with no obligation to sign up.

${rescheduleUrl ? `To reschedule, visit: ${rescheduleUrl}\n\n` : ''}If you need to reschedule or update access instructions, reply to this email or call/text us at (321) 524-3838.

Thank you,
Breez Pool Care
(321) 524-3838 | breezpoolcare.com
Space Coast, FL`;

    await resend.emails.send({
      from: 'Breez Pool Care <noreply@breezpoolcare.com>',
      to: finalEmail,
      subject,
      html,
      text,
    });

    if (leadId) {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        inspectionConfirmationSent: true,
        confirmationSentAt: new Date().toISOString(),
      }).catch(e => console.warn('Could not update Lead confirmation flag:', e.message));
    }

    console.log('sendInspectionConfirmation: email sent to', finalEmail);
    return Response.json({ success: true, emailSent: true });
  } catch (error) {
    console.error('sendInspectionConfirmation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});