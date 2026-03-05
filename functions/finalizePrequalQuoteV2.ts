import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { getAppOrigin } from './_getAppOrigin.js';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json200(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function getAppOrigin(req) {
  const envUrl = Deno.env.get('PUBLIC_APP_URL');
  if (envUrl) {
    const url = new URL(envUrl);
    if (url.protocol && url.host) return envUrl.replace(/\/$/, '');
    throw new Error('Invalid PUBLIC_APP_URL format');
  }
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host || host.includes('deno.dev')) {
    throw new Error('Cannot determine app origin from request headers');
  }
  return `${proto}://${host}`;
}

Deno.serve(async (req) => {
  const BUILD = 'FPQ_V2_2026_03_04';

  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const {
      token,
      prequalAnswers,
      clientFirstName: payloadFirstName,
      clientEmail: payloadEmail,
    } = payload || {};

    const { token, questionnaire, firstName: payloadFirstName, email: payloadEmail } = await req.json();

    if (!token || typeof token !== 'string') {
      return json200({ success: false, error: 'token is required', build: BUILD });
    }

    // Use clientFirstName and clientEmail from payload
    // Fall back to QuoteRequests only if not provided in payload
    let firstName = payloadFirstName || prequalAnswers?.clientFirstName || null;
    let email = payloadEmail || prequalAnswers?.clientEmail || null;
    // Lookup or create QuoteRequest + resolve lead
    let quoteRequest = null;
    let leadId = null;
    let quoteRequest = null;

    // Resolve QuoteRequests row via token (required)
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
      if (requests && requests.length > 0) {
        quoteRequest = requests[0];
        leadId = quoteRequest.leadId || null;
        // Only use QuoteRequests email if not provided in payload
        if (!email) email = quoteRequest.email;
        // Only use QuoteRequests firstName if not provided in payload
        if (!firstName) firstName = quoteRequest.firstName || null;
        console.log('FPQ_V2_TOKEN_RESOLVED', { token: token.trim().slice(0, 8), leadId, hasEmail: !!email, fromPayload: !!payloadEmail });
    let email = payloadEmail;
    let firstName = payloadFirstName;

    try {
      const qrs = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, '-created_date', 1);
      quoteRequest = qrs?.[0];
      if (quoteRequest) {
        leadId = quoteRequest.leadId || null;
        email = email || quoteRequest.email;
        firstName = firstName || quoteRequest.firstName;
      }
    } catch (e) {
      console.warn('FPQ_V2_QUOTE_REQUEST_LOOKUP_FAILED', { error: e.message });
    }

    if (!quoteRequest) {
      return json200({
        success: false,
        error: 'Invalid or expired token',
        code: 'TOKEN_NOT_FOUND',
        build: BUILD
      });
    }

    // Repair missing QuoteRequests contact fields from latest Quote snapshot before validation.
    // This avoids blocking tokenized users when QuoteRequests has a placeholder/empty email.
    if (!email || email === 'guest@breezpoolcare.com') {
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
        const latestQuote = quotes?.[0] || null;
        if (latestQuote) {
          if ((!email || email === 'guest@breezpoolcare.com') && latestQuote.clientEmail) {
            email = latestQuote.clientEmail;
          }
          if (!firstName && latestQuote.clientFirstName) {
            firstName = latestQuote.clientFirstName;
          }
          if (!leadId && latestQuote.leadId) {
            leadId = latestQuote.leadId;
          }

          const patch = {};
          if (leadId && quoteRequest.leadId !== leadId) patch.leadId = leadId;
          if (email && quoteRequest.email !== email) patch.email = email;
          if (firstName && quoteRequest.firstName !== firstName) patch.firstName = firstName;
          if (Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_QUOTE', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (repairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_QUOTE_FAILED', { error: repairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    if (!quoteRequest) {
      return json200({
        success: false,
        error: 'Invalid or expired token',
        code: 'TOKEN_NOT_FOUND',
    // Validate that email is present and normalize placeholders
    if (!email || email === 'guest@breezpoolcare.com') {
      return json200({
        success: false,
        error: 'Email is required (from payload, token, or quote snapshot)',
        code: 'INCOMPLETE_DATA',
        build: BUILD
      });
    }
    email = email.trim().toLowerCase();


    const sendQuoteReadyEmail = async ({ quoteToken, summary, targetLeadId }) => {
      try {
        const appOrigin = getAppOrigin(req);
        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken.trim())}`;
        const monthlyText = summary?.monthlyPrice || 'TBD';
        const oneTimeText = summary?.oneTimeFees ? `\n• One-time fees: ${summary.oneTimeFees}` : '';
        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${summary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          from_name: 'Breez Pool Care',
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          body: emailBody
        });

    // Use clientFirstName and clientEmail from payload
    // Fall back to QuoteRequests only if not provided in payload
    let firstName = payloadFirstName || prequalAnswers?.clientFirstName || null;
    let email = payloadEmail || prequalAnswers?.clientEmail || null;
    let leadId = null;
    let quoteRequest = null;

    // Resolve QuoteRequests row via token (required)
    try {
      const requests = await base44.asServiceRole.entities.QuoteRequests.filter({ token: token.trim() }, null, 1);
      if (requests && requests.length > 0) {
        quoteRequest = requests[0];
        leadId = quoteRequest.leadId || null;
        // Only use QuoteRequests email if not provided in payload
        if (!email) email = quoteRequest.email;
        // Only use QuoteRequests firstName if not provided in payload
        if (!firstName) firstName = quoteRequest.firstName || null;
        console.log('FPQ_V2_TOKEN_RESOLVED', { token: token.trim().slice(0, 8), leadId, hasEmail: !!email, fromPayload: !!payloadEmail });
        if (targetLeadId) {
          try {
            const leads = await base44.asServiceRole.entities.Lead.filter({ id: targetLeadId }, null, 1);
            const lead = leads?.[0] || null;
            if (lead) {
              const notes = `${lead.notes || ''}\n[QUOTE_EMAIL_SENT] ${new Date().toISOString()}`.trim();
              await base44.asServiceRole.entities.Lead.update(targetLeadId, { notes });
            }
          } catch (noteErr) {
            console.warn('FPQ_V2_QUOTE_EMAIL_NOTE_FAILED', { error: noteErr.message });
          }
        }

        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { leadId: targetLeadId || null, token: quoteToken.trim().slice(0, 8) });
      } catch (emailErr) {
        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message, token: quoteToken.trim().slice(0, 8) });
      }
    };

    // Normalize user-provided contact input before attempting fallbacks.
    if (typeof email === 'string') {
      const trimmedEmail = email.trim().toLowerCase();
      email = trimmedEmail || null;
    }
    if (typeof firstName === 'string') {
      const trimmedName = firstName.trim();
      firstName = trimmedName || null;
    }

    // Repair missing QuoteRequests contact fields from latest Quote snapshot before validation.
    // This avoids blocking tokenized users when QuoteRequests has a placeholder/empty email.
    if (!email || email === 'guest@breezpoolcare.com') {
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
        const latestQuote = quotes?.[0] || null;
        if (latestQuote) {
          if ((!email || email === 'guest@breezpoolcare.com') && latestQuote.clientEmail) {
            email = latestQuote.clientEmail;
          }
          if (!firstName && latestQuote.clientFirstName) {
            firstName = latestQuote.clientFirstName;
          }
          if (!leadId && latestQuote.leadId) {
            leadId = latestQuote.leadId;
          }

          const patch = {};
          if (leadId && quoteRequest.leadId !== leadId) patch.leadId = leadId;
          if (email && quoteRequest.email !== email) patch.email = email;
          if (firstName && quoteRequest.firstName !== firstName) patch.firstName = firstName;
          if (Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_QUOTE', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (repairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_QUOTE_FAILED', { error: repairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    // Final fallback: attempt to recover contact from linked Lead.
    if ((!email || email === 'guest@breezpoolcare.com') && leadId) {
      try {
        const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        const lead = leadRows?.[0] || null;
        if (lead) {
          if ((!email || email === 'guest@breezpoolcare.com') && lead.email) {
            email = String(lead.email).trim().toLowerCase();
          }
          if (!firstName && lead.firstName) {
            firstName = String(lead.firstName).trim() || null;
          }

          const patch = {};
          if (email && quoteRequest?.email !== email) patch.email = email;
          if (firstName && quoteRequest?.firstName !== firstName) patch.firstName = firstName;
          if (quoteRequest?.id && Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_LEAD', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (leadRepairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_LEAD_FAILED', { error: leadRepairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    if (!quoteRequest) {
      return json200({
        success: false,
        error: 'Invalid or expired token',
        code: 'TOKEN_NOT_FOUND',
    // Validate that email is present and normalize placeholders
    if (!email || email === 'guest@breezpoolcare.com') {
      return json200({
        success: false,
        error: 'Email is required (from payload, token, or quote snapshot)',
        code: 'INCOMPLETE_DATA',
        build: BUILD
      });
    }
    email = email.trim().toLowerCase();


    const sendQuoteReadyEmail = async ({ quoteToken, summary, targetLeadId }) => {
      try {
        const appOrigin = getAppOrigin(req);
        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken.trim())}`;
        const monthlyText = summary?.monthlyPrice || 'TBD';
        const oneTimeText = summary?.oneTimeFees ? `\n• One-time fees: ${summary.oneTimeFees}` : '';
        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${summary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          from_name: 'Breez Pool Care',
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          body: emailBody
        });

        if (targetLeadId) {
          try {
            const leads = await base44.asServiceRole.entities.Lead.filter({ id: targetLeadId }, null, 1);
            const lead = leads?.[0] || null;
            if (lead) {
              const notes = `${lead.notes || ''}\n[QUOTE_EMAIL_SENT] ${new Date().toISOString()}`.trim();
              await base44.asServiceRole.entities.Lead.update(targetLeadId, { notes });
            }
          } catch (noteErr) {
            console.warn('FPQ_V2_QUOTE_EMAIL_NOTE_FAILED', { error: noteErr.message });
          }
        }

        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { leadId: targetLeadId || null, token: quoteToken.trim().slice(0, 8) });
      } catch (emailErr) {
        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message, token: quoteToken.trim().slice(0, 8) });
      }
    };

    // Normalize user-provided contact input before attempting fallbacks.
    if (typeof email === 'string') {
      const trimmedEmail = email.trim().toLowerCase();
      email = trimmedEmail || null;
    }
    if (typeof firstName === 'string') {
      const trimmedName = firstName.trim();
      firstName = trimmedName || null;
    }

    // Repair missing QuoteRequests contact fields from latest Quote snapshot before validation.
    // This avoids blocking tokenized users when QuoteRequests has a placeholder/empty email.
    if (!email || email === 'guest@breezpoolcare.com') {
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
        const latestQuote = quotes?.[0] || null;
        if (latestQuote) {
          if ((!email || email === 'guest@breezpoolcare.com') && latestQuote.clientEmail) {
            email = latestQuote.clientEmail;
          }
          if (!firstName && latestQuote.clientFirstName) {
            firstName = latestQuote.clientFirstName;
          }
          if (!leadId && latestQuote.leadId) {
            leadId = latestQuote.leadId;
          }

          const patch = {};
          if (leadId && quoteRequest.leadId !== leadId) patch.leadId = leadId;
          if (email && quoteRequest.email !== email) patch.email = email;
          if (firstName && quoteRequest.firstName !== firstName) patch.firstName = firstName;
          if (Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_QUOTE', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (repairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_QUOTE_FAILED', { error: repairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    // Final fallback: attempt to recover contact from linked Lead.
    if ((!email || email === 'guest@breezpoolcare.com') && leadId) {
      try {
        const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        const lead = leadRows?.[0] || null;
        if (lead) {
          if ((!email || email === 'guest@breezpoolcare.com') && lead.email) {
            email = String(lead.email).trim().toLowerCase();
          }
          if (!firstName && lead.firstName) {
            firstName = String(lead.firstName).trim() || null;
          }

          const patch = {};
          if (email && quoteRequest?.email !== email) patch.email = email;
          if (firstName && quoteRequest?.firstName !== firstName) patch.firstName = firstName;
          if (quoteRequest?.id && Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_LEAD', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (leadRepairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_LEAD_FAILED', { error: leadRepairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    if (!quoteRequest) {
      return json200({
        success: false,
        error: 'Invalid or expired token',
        code: 'TOKEN_NOT_FOUND',
    // Validate that email is present and normalize placeholders
    if (!email || email === 'guest@breezpoolcare.com') {
      return json200({
        success: false,
        error: 'Email is required (from payload, token, or quote snapshot)',
        code: 'INCOMPLETE_DATA',
        build: BUILD
      });
    }
    email = email.trim().toLowerCase();


    const sendQuoteReadyEmail = async ({ quoteToken, summary, targetLeadId }) => {
      try {
        const appOrigin = getAppOrigin(req);
        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken.trim())}`;
        const monthlyText = summary?.monthlyPrice || 'TBD';
        const oneTimeText = summary?.oneTimeFees ? `\n• One-time fees: ${summary.oneTimeFees}` : '';
        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${summary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          from_name: 'Breez Pool Care',
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          body: emailBody
        });

        if (targetLeadId) {
          try {
            const leads = await base44.asServiceRole.entities.Lead.filter({ id: targetLeadId }, null, 1);
            const lead = leads?.[0] || null;
            if (lead) {
              const notes = `${lead.notes || ''}\n[QUOTE_EMAIL_SENT] ${new Date().toISOString()}`.trim();
              await base44.asServiceRole.entities.Lead.update(targetLeadId, { notes });
            }
          } catch (noteErr) {
            console.warn('FPQ_V2_QUOTE_EMAIL_NOTE_FAILED', { error: noteErr.message });
          }
        }

        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { leadId: targetLeadId || null, token: quoteToken.trim().slice(0, 8) });
      } catch (emailErr) {
        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message, token: quoteToken.trim().slice(0, 8) });
      }
    };

    // Normalize user-provided contact input before attempting fallbacks.
    if (typeof email === 'string') {
      const trimmedEmail = email.trim().toLowerCase();
      email = trimmedEmail || null;
    }
    if (typeof firstName === 'string') {
      const trimmedName = firstName.trim();
      firstName = trimmedName || null;
    }

    // Repair missing QuoteRequests contact fields from latest Quote snapshot before validation.
    // This avoids blocking tokenized users when QuoteRequests has a placeholder/empty email.
    if (!email || email === 'guest@breezpoolcare.com') {
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
        const latestQuote = quotes?.[0] || null;
        if (latestQuote) {
          if ((!email || email === 'guest@breezpoolcare.com') && latestQuote.clientEmail) {
            email = latestQuote.clientEmail;
          }
          if (!firstName && latestQuote.clientFirstName) {
            firstName = latestQuote.clientFirstName;
          }
          if (!leadId && latestQuote.leadId) {
            leadId = latestQuote.leadId;
          }

          const patch = {};
          if (leadId && quoteRequest.leadId !== leadId) patch.leadId = leadId;
          if (email && quoteRequest.email !== email) patch.email = email;
          if (firstName && quoteRequest.firstName !== firstName) patch.firstName = firstName;
          if (Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_QUOTE', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (repairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_QUOTE_FAILED', { error: repairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    if (!quoteRequest) {
      return json200({
        success: false,
        error: 'Invalid or expired token',
        code: 'TOKEN_NOT_FOUND',
    // Final fallback: attempt to recover contact from linked Lead.
    if ((!email || email === 'guest@breezpoolcare.com') && leadId) {
      try {
        const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        const lead = leadRows?.[0] || null;
        if (lead) {
          if ((!email || email === 'guest@breezpoolcare.com') && lead.email) {
            email = String(lead.email).trim().toLowerCase();
          }
          if (!firstName && lead.firstName) {
            firstName = String(lead.firstName).trim() || null;
          }

          const patch = {};
          if (email && quoteRequest?.email !== email) patch.email = email;
          if (firstName && quoteRequest?.firstName !== firstName) patch.firstName = firstName;
          if (quoteRequest?.id && Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_LEAD', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (leadRepairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_LEAD_FAILED', { error: leadRepairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    // Validate that email is present and normalize placeholders
    if (!email || email === 'guest@breezpoolcare.com') {
      return json200({
        success: false,
        error: 'Email is required (from payload, token, or quote snapshot)',
        code: 'INCOMPLETE_DATA',
        build: BUILD
      });
    }
    email = email.trim().toLowerCase();


    const sendQuoteReadyEmail = async ({ quoteToken, summary, targetLeadId }) => {
      try {
        const appOrigin = getAppOrigin(req);
        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken.trim())}`;
        const monthlyText = summary?.monthlyPrice || 'TBD';
        const oneTimeText = summary?.oneTimeFees ? `\n• One-time fees: ${summary.oneTimeFees}` : '';
        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${summary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          from_name: 'Breez Pool Care',
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          body: emailBody
        });

        if (targetLeadId) {
          try {
            const leads = await base44.asServiceRole.entities.Lead.filter({ id: targetLeadId }, null, 1);
            const lead = leads?.[0] || null;
            if (lead) {
              const notes = `${lead.notes || ''}\n[QUOTE_EMAIL_SENT] ${new Date().toISOString()}`.trim();
              await base44.asServiceRole.entities.Lead.update(targetLeadId, { notes });
            }
          } catch (noteErr) {
            console.warn('FPQ_V2_QUOTE_EMAIL_NOTE_FAILED', { error: noteErr.message });
          }
        }

        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { leadId: targetLeadId || null, token: quoteToken.trim().slice(0, 8) });
      } catch (emailErr) {
        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message, token: quoteToken.trim().slice(0, 8) });
      }
    };

    // Normalize user-provided contact input before attempting fallbacks.
    if (typeof email === 'string') {
      const trimmedEmail = email.trim().toLowerCase();
      email = trimmedEmail || null;
    }
    if (typeof firstName === 'string') {
      const trimmedName = firstName.trim();
      firstName = trimmedName || null;
    }

    // Repair missing QuoteRequests contact fields from latest Quote snapshot before validation.
    // This avoids blocking tokenized users when QuoteRequests has a placeholder/empty email.
    if (!email || email === 'guest@breezpoolcare.com') {
      try {
        const quotes = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
        const latestQuote = quotes?.[0] || null;
        if (latestQuote) {
          if ((!email || email === 'guest@breezpoolcare.com') && latestQuote.clientEmail) {
            email = latestQuote.clientEmail;
          }
          if (!firstName && latestQuote.clientFirstName) {
            firstName = latestQuote.clientFirstName;
          }
          if (!leadId && latestQuote.leadId) {
            leadId = latestQuote.leadId;
          }

          const patch = {};
          if (leadId && quoteRequest.leadId !== leadId) patch.leadId = leadId;
          if (email && quoteRequest.email !== email) patch.email = email;
          if (firstName && quoteRequest.firstName !== firstName) patch.firstName = firstName;
          if (Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_QUOTE', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (repairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_QUOTE_FAILED', { error: repairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    // Final fallback: attempt to recover contact from linked Lead.
    if ((!email || email === 'guest@breezpoolcare.com') && leadId) {
      try {
        const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        const lead = leadRows?.[0] || null;
        if (lead) {
          if ((!email || email === 'guest@breezpoolcare.com') && lead.email) {
            email = String(lead.email).trim().toLowerCase();
          }
          if (!firstName && lead.firstName) {
            firstName = String(lead.firstName).trim() || null;
          }

          const patch = {};
          if (email && quoteRequest?.email !== email) patch.email = email;
          if (firstName && quoteRequest?.firstName !== firstName) patch.firstName = firstName;
          if (quoteRequest?.id && Object.keys(patch).length > 0) {
            await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, patch);
            console.log('FPQ_V2_REPAIRED_FROM_LEAD', { token: token.trim().slice(0, 8), repaired: Object.keys(patch) });
          }
        }
      } catch (leadRepairErr) {
        console.warn('FPQ_V2_REPAIR_FROM_LEAD_FAILED', { error: leadRepairErr.message, token: token.trim().slice(0, 8) });
      }
    }

    // Validate that email is present and normalize placeholders
    if (!email || email === 'guest@breezpoolcare.com') {
      return json200({
        success: false,
        error: 'Email is required (from payload, token, or quote snapshot)',
        code: 'INCOMPLETE_DATA',
        build: BUILD
      });
    }
    email = email.trim().toLowerCase();


    const sendQuoteReadyEmail = async ({ quoteToken, summary, targetLeadId }) => {
      try {
        const appOrigin = getAppOrigin(req);
        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken.trim())}`;
        const monthlyText = summary?.monthlyPrice || 'TBD';
        const oneTimeText = summary?.oneTimeFees ? `\n• One-time fees: ${summary.oneTimeFees}` : '';
        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${summary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          from_name: 'Breez Pool Care',
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          body: emailBody
        });

        if (targetLeadId) {
          try {
            const leads = await base44.asServiceRole.entities.Lead.filter({ id: targetLeadId }, null, 1);
            const lead = leads?.[0] || null;
            if (lead) {
              const notes = `${lead.notes || ''}\n[QUOTE_EMAIL_SENT] ${new Date().toISOString()}`.trim();
              await base44.asServiceRole.entities.Lead.update(targetLeadId, { notes });
            }
          } catch (noteErr) {
            console.warn('FPQ_V2_QUOTE_EMAIL_NOTE_FAILED', { error: noteErr.message });
          }
        }

        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { leadId: targetLeadId || null, token: quoteToken.trim().slice(0, 8) });
      } catch (emailErr) {
        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message, token: quoteToken.trim().slice(0, 8) });
      }
    };

    // Check if quote already exists for this token (idempotency)
      return json200({ success: false, error: 'Invalid or expired token', code: 'TOKEN_NOT_FOUND', build: BUILD });
    }

    if (!email || email === 'guest@breezpoolcare.com') {
      return json200({ success: false, error: 'Email is required', build: BUILD });
    }
    email = email.trim().toLowerCase();

    // Check if quote already exists (idempotency)
    let existingQuote = null;
    try {
      const existing = await base44.asServiceRole.entities.Quote.filter({ quoteToken: token.trim() }, '-created_date', 1);
      existingQuote = existing?.[0];
    } catch (e) {
      console.warn('FPQ_V2_IDEMPOTENCY_CHECK_FAILED', { error: e.message });
    }

    // If quote exists, return it (after ensuring linkage is still usable)
    if (existingQuote) {
      if (!leadId && existingQuote.leadId) {
        leadId = existingQuote.leadId;
      }

      // Repair/create lead linkage for scheduling reliability
      try {
        let lead = null;
        if (leadId) {
          const rows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
          lead = rows?.[0] || null;
        }

        if (!lead) {
          const activeRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: false }, '-created_date', 1);
          lead = activeRows?.[0] || null;
        }

        if (!lead) {
          const deletedRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: true }, '-created_date', 1);
          const deletedLead = deletedRows?.[0] || null;
          if (deletedLead) {
            lead = await base44.asServiceRole.entities.Lead.update(deletedLead.id, {
              isDeleted: false,
              firstName: firstName || deletedLead.firstName || 'Customer',
              email
            });
          }
        }

        if (!lead) {
          lead = await base44.asServiceRole.entities.Lead.create({
            firstName: firstName || 'Customer',
            email,
            stage: 'contacted',
            quoteGenerated: true,
            isDeleted: false
          });
        } else {
          lead = await base44.asServiceRole.entities.Lead.update(lead.id, {
            firstName: firstName || lead.firstName || 'Customer',
            email,
            quoteGenerated: true,
            ...(lead.stage === 'new_lead' ? { stage: 'contacted' } : {})
          });
        }

        leadId = lead.id;
        await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, {
          leadId,
          email,
          firstName: firstName || lead.firstName || null
        });
      } catch (linkErr) {
        console.warn('FPQ_V2_LINKAGE_REPAIR_FAILED', { error: linkErr.message });
      }
    if (existingQuote) {
      if (!leadId && existingQuote.leadId) {
        leadId = existingQuote.leadId;
      }

      // Repair/create lead linkage for scheduling reliability
      try {
        let lead = null;
        if (leadId) {
          const rows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
          lead = rows?.[0] || null;
        }

        if (!lead) {
          const activeRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: false }, '-created_date', 1);
          lead = activeRows?.[0] || null;
        }

        if (!lead) {
          const deletedRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: true }, '-created_date', 1);
          const deletedLead = deletedRows?.[0] || null;
          if (deletedLead) {
            lead = await base44.asServiceRole.entities.Lead.update(deletedLead.id, {
              isDeleted: false,
              firstName: firstName || deletedLead.firstName || 'Customer',
              email
            });
          }
        }

        if (!lead) {
          lead = await base44.asServiceRole.entities.Lead.create({
            firstName: firstName || 'Customer',
            email,
            stage: 'contacted',
            quoteGenerated: true,
            isDeleted: false
          });
        } else {
          lead = await base44.asServiceRole.entities.Lead.update(lead.id, {
            firstName: firstName || lead.firstName || 'Customer',
            email,
            quoteGenerated: true,
            ...(lead.stage === 'new_lead' ? { stage: 'contacted' } : {})
          });
        }

        leadId = lead.id;
        await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, {
          leadId,
          email,
          firstName: firstName || lead.firstName || null
        });
      } catch (linkErr) {
        console.warn('FPQ_V2_LINKAGE_REPAIR_FAILED', { error: linkErr.message });
      }
    if (existingQuote) {
      if (!leadId && existingQuote.leadId) {
        leadId = existingQuote.leadId;
      }

      // Repair/create lead linkage for scheduling reliability
      try {
        let lead = null;
        if (leadId) {
          const rows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
          lead = rows?.[0] || null;
        }

        if (!lead) {
          const activeRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: false }, '-created_date', 1);
          lead = activeRows?.[0] || null;
        }

        if (!lead) {
          const deletedRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: true }, '-created_date', 1);
          const deletedLead = deletedRows?.[0] || null;
          if (deletedLead) {
            lead = await base44.asServiceRole.entities.Lead.update(deletedLead.id, {
              isDeleted: false,
              firstName: firstName || deletedLead.firstName || 'Customer',
              email
            });
          }
        }

        if (!lead) {
          lead = await base44.asServiceRole.entities.Lead.create({
            firstName: firstName || 'Customer',
            email,
            stage: 'contacted',
            quoteGenerated: true,
            isDeleted: false
          });
        } else {
          lead = await base44.asServiceRole.entities.Lead.update(lead.id, {
            firstName: firstName || lead.firstName || 'Customer',
            email,
            quoteGenerated: true,
            ...(lead.stage === 'new_lead' ? { stage: 'contacted' } : {})
          });
        }

        leadId = lead.id;
        await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, {
          leadId,
          email,
          firstName: firstName || lead.firstName || null
        });
      } catch (linkErr) {
        console.warn('FPQ_V2_LINKAGE_REPAIR_FAILED', { error: linkErr.message });
      }
    // If quote exists, send email and return
    if (existingQuote) {
      if (!leadId && existingQuote.leadId) leadId = existingQuote.leadId;

      const priceSummary = {
        monthlyPrice: existingQuote.outputMonthlyPrice ? `$${existingQuote.outputMonthlyPrice}` : '$0',
        visitFrequency: existingQuote.outputFrequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
        oneTimeFees: existingQuote.outputOneTimeFees && existingQuote.outputOneTimeFees > 0 ? `$${existingQuote.outputOneTimeFees}` : null,
      };

      await sendQuoteReadyEmail({
        quoteToken: existingQuote.quoteToken || token.trim(),
        summary: priceSummary,
        targetLeadId: leadId || existingQuote.leadId || null
      });
      try {
        const appOrigin = getAppOrigin(req);
        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(token.trim())}`;
        const monthlyText = priceSummary?.monthlyPrice || 'TBD';
        const oneTimeText = priceSummary?.oneTimeFees ? `\n• One-time fees: ${priceSummary.oneTimeFees}` : '';
        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${priceSummary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          from_name: 'Breez Pool Care',
          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
          body: emailBody
        });
        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { token: token.trim().slice(0, 8) });
      } catch (emailErr) {
        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message });
      }

      return json200({
        success: true,
        quoteToken: existingQuote.quoteToken,
        leadId: leadId || existingQuote.leadId || null,
        firstName: existingQuote.clientFirstName || firstName,
        email: existingQuote.clientEmail || email,
        firstName,
        email,
        priceSummary,
        build: BUILD
      });
    }

    // Load AdminSettings for pricing
    let settings = null;
    try {
      const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
      settings = rows?.[0];
      if (!settings) {
        return json200({ success: false, error: 'Pricing configuration not found', build: BUILD });
      }
    } catch (e) {
      return json200({ success: false, error: 'Failed to load settings', build: BUILD });
    }

    // Calculate quote (placeholder—use actual pricing engine)
    const priceSummary = {
      monthlyPrice: '$149',
      visitFrequency: 'Weekly',
      oneTimeFees: null,
    };

    // Create or update Lead
    if (!leadId) {
      try {
        const newLead = await base44.asServiceRole.entities.Lead.create({
          email,
          firstName: firstName || 'Customer',
          stage: 'contacted',
          quoteGenerated: true,
        });
        leadId = newLead.id;
      } catch (e) {
        console.warn('FPQ_V2_LEAD_CREATE_FAILED', { error: e.message });
        leadId = null;
      }
    } else {
      try {
        await base44.asServiceRole.entities.Lead.update(leadId, {
          firstName: firstName || 'Customer',
          email,
          quoteGenerated: true,
        });
      } catch (e) {
        console.warn('FPQ_V2_LEAD_UPDATE_FAILED', { error: e.message });
      }
    }

    // Build priceSummary
    const isNotSure = prequalAnswers.poolSize === 'not_sure';
    const priceSummary = {
      monthlyPrice: isNotSure 
        ? `$${quoteResult.minMonthly}–$${quoteResult.maxMonthly}` 
        : `$${quoteResult.finalMonthlyPrice}`,
      visitFrequency: quoteResult.frequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
      planName: isNotSure ? 'Estimated' : 'Your Quote',
      oneTimeFees: isNotSure 
        ? (quoteResult.minOneTimeFees > 0 ? `$${quoteResult.minOneTimeFees}–$${quoteResult.maxOneTimeFees}` : null) 
        : (quoteResult.oneTimeFees > 0 ? `$${quoteResult.oneTimeFees}` : null),
      frequencyAutoRequired: quoteResult.frequencyAutoRequired
    };

    // Ensure lead linkage is available for downstream scheduling
    try {
      let lead = null;
      if (leadId) {
        const rows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
        lead = rows?.[0] || null;
      }

      if (!lead) {
        const activeRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: false }, '-created_date', 1);
        lead = activeRows?.[0] || null;
      }

      if (!lead) {
        const deletedRows = await base44.asServiceRole.entities.Lead.filter({ email, isDeleted: true }, '-created_date', 1);
        const deletedLead = deletedRows?.[0] || null;
        if (deletedLead) {
          lead = await base44.asServiceRole.entities.Lead.update(deletedLead.id, {
            isDeleted: false,
            firstName: firstName || deletedLead.firstName || 'Customer',
            email
          });
        }
      }

      if (!lead) {
        lead = await base44.asServiceRole.entities.Lead.create({
          firstName: firstName || 'Customer',
          email,
          stage: 'contacted',
          quoteGenerated: true,
          isDeleted: false
        });
      } else {
        lead = await base44.asServiceRole.entities.Lead.update(lead.id, {
          firstName: firstName || lead.firstName || 'Customer',
          email,
          quoteGenerated: true,
          ...(lead.stage === 'new_lead' ? { stage: 'contacted' } : {})
        });
      }

      leadId = lead.id;
      await base44.asServiceRole.entities.QuoteRequests.update(quoteRequest.id, {
        leadId,
        email,
        firstName: firstName || lead.firstName || null
      });
      console.log('FPQ_V2_QUOTEREQUEST_LINKED', { quoteRequestId: quoteRequest.id, leadId });
    } catch (linkErr) {
      console.warn('FPQ_V2_LEAD_LINKAGE_FAILED', { error: linkErr.message });
    }

    // Persist quote snapshot to Quote entity
    // Create Quote
    let persistedQuote = null;
    try {
      const quoteToken = crypto.randomUUID();
      persistedQuote = await base44.asServiceRole.entities.Quote.create({
        clientEmail: email,
        clientFirstName: firstName,
        quoteToken,
        status: 'quoted',
        pricingEngineVersion: PRICING_ENGINE_VERSION,
        // Store inputs
        inputPoolSize: prequalAnswers.poolSize,
        inputEnclosure: prequalAnswers.enclosure,
        inputChlorinationMethod: prequalAnswers.chlorinationMethod,
        inputUseFrequency: prequalAnswers.useFrequency,
        inputTreesOverhead: prequalAnswers.treesOverhead,
        inputPetsAccess: prequalAnswers.petsAccess === true,
        inputPoolCondition: prequalAnswers.poolCondition,
        // Store outputs (handle range)
        outputMonthlyPrice: isNotSure ? null : quoteResult.finalMonthlyPrice,
        outputPerVisitPrice: isNotSure ? null : quoteResult.perVisitPrice,
        outputOneTimeFees: isNotSure ? null : quoteResult.oneTimeFees,
        outputFirstMonthTotal: isNotSure ? null : quoteResult.firstMonthTotal,
        outputFrequency: quoteResult.frequency,
        outputFrequencyAutoRequired: quoteResult.frequencyAutoRequired || false,
        outputSizeTier: isNotSure ? null : quoteResult.sizeTier,
        outputGreenSizeGroup: isNotSure ? null : quoteResult.greenSizeGroup
      };

      persistedQuote = await base44.asServiceRole.entities.Quote.create(quoteData);
      console.log('FPQ_V2_QUOTE_PERSISTED', { quoteId: persistedQuote.id, token: token.trim().slice(0, 8) });

      // Auto-stage progression: update Lead to 'contacted' after quote persistence
      if (leadId) {
        try {
          const leadRows = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
          const lead = leadRows?.[0] || null;
          const currentStage = lead?.stage || 'new_lead';
          if (currentStage === 'new_lead') {
            await base44.asServiceRole.entities.Lead.update(leadId, { stage: 'contacted' });
            console.log('FPQ_V2_STAGE_PROGRESSED', { leadId, oldStage: currentStage, newStage: 'contacted' });
          }
        } catch (stageErr) {
          console.warn('FPQ_V2_STAGE_UPDATE_FAILED', { error: stageErr.message });
          // Non-fatal: continue even if stage update fails
        }
      }

      // Send quote-ready scheduling email (non-blocking)
      await sendQuoteReadyEmail({
        quoteToken: token.trim(),
        summary: priceSummary,
        targetLeadId: leadId || null
        outputMonthlyPrice: 149,
        outputFrequency: 'weekly',
        outputOneTimeFees: 0,
        inputPoolSize: questionnaire?.poolSize || 'not_sure',
        inputEnclosure: questionnaire?.enclosure || 'not_sure',
        ...(leadId ? { leadId } : {}),
      });
    } catch (e) {
      console.warn('FPQ_V2_QUOTE_CREATE_FAILED', { error: e.message });
    }

    // Send quote email
    try {
      const appOrigin = getAppOrigin(req);
      const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(token.trim())}`;
      const monthlyText = priceSummary?.monthlyPrice || 'TBD';
      const oneTimeText = priceSummary?.oneTimeFees ? `\n• One-time fees: ${priceSummary.oneTimeFees}` : '';
      const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${priceSummary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        from_name: 'Breez Pool Care',
        subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
        body: emailBody
      });
      console.log('FPQ_V2_QUOTE_EMAIL_SENT', { token: token.trim().slice(0, 8) });
    } catch (emailErr) {
      console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message });
    }

    return json200({
      success: true,
      quoteToken: token.trim(),
      leadId: leadId || null,
      firstName,
      email,
      priceSummary,
      persisted: !!persistedQuote,
      build: BUILD
    });

  } catch (error) {
    console.error('FPQ_V2_CRASH', { error: error?.message });
    return json200({
      success: false,
      error: 'Quote finalization failed',
      detail: error?.message,
      build: BUILD
    });
  }
});
