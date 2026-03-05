import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * acceptAgreements
 * Backend function to safely accept agreements and update Lead record.
 * Uses service role to bypass RLS constraints when user is not yet linked to lead.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      leadId,
      serviceAgreement,
      privacyPolicy,
      photoConsent,
      ipAddress,
      userAgent,
    } = payload;

    if (!leadId) {
      return Response.json({ error: 'leadId required' }, { status: 400 });
    }

    // Create or upsert AgreementAcceptance record
    const existing = await base44.entities.AgreementAcceptance.filter({
      leadId,
    }, '-created_date', 1);

    if (existing.length > 0) {
      await base44.entities.AgreementAcceptance.update(existing[0].id, {
        agreedToServiceAgreement: serviceAgreement,
        agreedToPrivacyPolicy: privacyPolicy,
        photoConsent: photoConsent || false,
        acceptedAt: new Date().toISOString(),
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      });
    } else {
      const lead = await base44.asServiceRole.entities.Lead.get(leadId);
      if (!lead) {
        return Response.json({ error: 'Lead not found' }, { status: 404 });
      }

      await base44.entities.AgreementAcceptance.create({
        leadId,
        email: lead.email,
        serviceAddress: lead.serviceAddress,
        agreedToServiceAgreement: serviceAgreement,
        agreedToPrivacyPolicy: privacyPolicy,
        photoConsent: photoConsent || false,
        acceptedAt: new Date().toISOString(),
        versionServiceAgreement: 'v1',
        versionPrivacyPolicy: 'v1',
        versionPhotoConsent: 'v1',
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      });
    }

    // Update Lead with service role (bypasses RLS for users not yet linked)
    await base44.asServiceRole.entities.Lead.update(leadId, {
      agreementsAccepted: true,
      agreementsAcceptedAt: new Date().toISOString(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[acceptAgreements] error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});