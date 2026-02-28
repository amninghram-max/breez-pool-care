import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { leadId, incidentType, approxTimeOccurred, anyoneSwamSince, notes } = await req.json();
    if (!leadId || !incidentType) {
      return Response.json({ error: 'leadId and incidentType are required' }, { status: 400 });
    }

    // Create immutable incident record
    const incident = await base44.asServiceRole.entities.FecalIncident.create({
      leadId,
      reportedByUserId: user.id,
      reportedAt: new Date().toISOString(),
      incidentType,
      approxTimeOccurred: approxTimeOccurred || null,
      anyoneSwamSince: !!anyoneSwamSince,
      notes: notes || '',
      status: 'open',
      adminAlertSent: false,
    });

    // Fetch lead details for the alert email
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId });
    const lead = leads[0];
    const customerName = lead ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() : 'Unknown Customer';
    const serviceAddress = lead?.serviceAddress || 'Unknown Address';

    // Get admin users to alert
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });

    const incidentTypeLabel = {
      formed_stool: 'Formed Stool',
      diarrheal: 'Diarrheal',
      unsure: 'Unsure',
    }[incidentType] || incidentType;

    const emailBody = `
<h2 style="color:#b91c1c;">🚨 Fecal Incident Reported</h2>
<p><strong>Customer:</strong> ${customerName}</p>
<p><strong>Address:</strong> ${serviceAddress}</p>
<p><strong>Incident Type:</strong> ${incidentTypeLabel}</p>
<p><strong>Approximate Time:</strong> ${approxTimeOccurred || 'Not specified'}</p>
<p><strong>Anyone Swam Since:</strong> ${anyoneSwamSince ? 'Yes' : 'No'}</p>
${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
<p><strong>Reported At:</strong> ${new Date().toLocaleString()}</p>
<hr/>
<p style="color:#6b7280;font-size:13px;">Please initiate disinfection procedures and contact the customer. Clear the incident in the admin portal once disinfection is complete.</p>
    `.trim();

    // Send alert to all admins
    const alertPromises = admins.map(admin =>
      base44.asServiceRole.integrations.Core.SendEmail({
        to: admin.email,
        subject: `🚨 Fecal Incident Reported — ${customerName} (${serviceAddress})`,
        body: emailBody,
      }).catch(e => console.error('Email send error:', e))
    );
    await Promise.all(alertPromises);

    // Mark alert as sent
    await base44.asServiceRole.entities.FecalIncident.update(incident.id, { adminAlertSent: true });

    return Response.json({ success: true, incidentId: incident.id });
  } catch (error) {
    console.error('reportFecalIncident error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});