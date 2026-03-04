diff --git a/functions/finalizePrequalQuoteV2.ts b/functions/finalizePrequalQuoteV2.ts
index 95efbf655c1f25f6566791031b9340e444dc25cc..36c79698f70f2077dec8df56323915bd217d9539 100644
--- a/functions/finalizePrequalQuoteV2.ts
+++ b/functions/finalizePrequalQuoteV2.ts
@@ -175,50 +175,85 @@ Deno.serve(async (req) => {
         console.log('FPQ_V2_TOKEN_RESOLVED', { token: token.trim().slice(0, 8), leadId, hasEmail: !!email, fromPayload: !!payloadEmail });
       }
     } catch (e) {
       console.warn('FPQ_V2_TOKEN_RESOLUTION_FAILED', { error: e.message });
     }
 
     if (!quoteRequest) {
       return json200({
         success: false,
         error: 'Invalid or expired token',
         code: 'TOKEN_NOT_FOUND',
         build: BUILD
       });
     }
 
     // Validate that email is present and normalize placeholders
     if (!email || email === 'guest@breezpoolcare.com') {
       return json200({
         success: false,
         error: 'Email is required (from payload or token)',
         build: BUILD
       });
     }
     email = email.trim().toLowerCase();
 
+
+    const sendQuoteReadyEmail = async ({ quoteToken, summary, targetLeadId }) => {
+      try {
+        const appOrigin = getAppOrigin(req);
+        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(quoteToken.trim())}`;
+        const monthlyText = summary?.monthlyPrice || 'TBD';
+        const oneTimeText = summary?.oneTimeFees ? `\n• One-time fees: ${summary.oneTimeFees}` : '';
+        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${summary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;
+
+        await base44.asServiceRole.integrations.Core.SendEmail({
+          to: email,
+          from_name: 'Breez Pool Care',
+          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
+          body: emailBody
+        });
+
+        if (targetLeadId) {
+          try {
+            const leads = await base44.asServiceRole.entities.Lead.filter({ id: targetLeadId }, null, 1);
+            const lead = leads?.[0] || null;
+            if (lead) {
+              const notes = `${lead.notes || ''}\n[QUOTE_EMAIL_SENT] ${new Date().toISOString()}`.trim();
+              await base44.asServiceRole.entities.Lead.update(targetLeadId, { notes });
+            }
+          } catch (noteErr) {
+            console.warn('FPQ_V2_QUOTE_EMAIL_NOTE_FAILED', { error: noteErr.message });
+          }
+        }
+
+        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { leadId: targetLeadId || null, token: quoteToken.trim().slice(0, 8) });
+      } catch (emailErr) {
+        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message, token: quoteToken.trim().slice(0, 8) });
+      }
+    };
+
     // Check if quote already exists for this token (idempotency)
     let existingQuote = null;
     try {
       const existing = await base44.asServiceRole.entities.Quote.filter(
         { quoteToken: token.trim() },
         '-created_date',
         1
       );
       if (existing && existing.length > 0) {
         existingQuote = existing[0];
         console.log('FPQ_V2_IDEMPOTENCY_HIT', { token: token.trim().slice(0, 8), quoteId: existingQuote.id });
       }
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
@@ -256,50 +291,57 @@ Deno.serve(async (req) => {
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
 
       const priceSummary = {
         monthlyPrice: existingQuote.outputMonthlyPrice ? `$${existingQuote.outputMonthlyPrice}` : '$0',
         visitFrequency: existingQuote.outputFrequency === 'weekly' ? 'Weekly' : 'Twice Weekly',
         planName: 'Your Quote',
         oneTimeFees: existingQuote.outputOneTimeFees && existingQuote.outputOneTimeFees > 0 ? `$${existingQuote.outputOneTimeFees}` : null,
         frequencyAutoRequired: existingQuote.outputFrequencyAutoRequired || false
       };
+
+      await sendQuoteReadyEmail({
+        quoteToken: existingQuote.quoteToken || token.trim(),
+        summary: priceSummary,
+        targetLeadId: leadId || existingQuote.leadId || null
+      });
+
       return json200({
         success: true,
         quoteToken: existingQuote.quoteToken,
         leadId: leadId || existingQuote.leadId || null,
         firstName: existingQuote.clientFirstName || firstName,
         email: existingQuote.clientEmail || email,
         priceSummary,
         persisted: false, // existing, not newly persisted
         build: BUILD
       });
     }
 
     // Load AdminSettings for pricing
     let settings = null;
     try {
       const rows = await base44.asServiceRole.entities.AdminSettings.list('-created_date', 1);
       settings = rows[0];
       if (!settings) {
         return json200({
           success: false,
           error: 'Pricing configuration not found',
           build: BUILD
         });
       }
     } catch (e) {
@@ -450,81 +492,55 @@ Deno.serve(async (req) => {
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
-      try {
-        const appOrigin = getAppOrigin(req);
-        const scheduleLink = `${appOrigin}/ScheduleInspection?token=${encodeURIComponent(token.trim())}`;
-        const monthlyText = priceSummary?.monthlyPrice || 'TBD';
-        const oneTimeText = priceSummary?.oneTimeFees ? `\n• One-time fees: ${priceSummary.oneTimeFees}` : '';
-        const emailBody = `Hi ${firstName || 'there'},\n\nYour Breez quote is ready.\n\n• Monthly: ${monthlyText}\n• Frequency: ${priceSummary?.visitFrequency || 'Weekly'}${oneTimeText}\n\nSchedule your free inspection here:\n${scheduleLink}\n\n— Breez Pool Care`;
-
-        await base44.asServiceRole.integrations.Core.SendEmail({
-          to: email,
-          from_name: 'Breez Pool Care',
-          subject: 'Your Breez Quote Is Ready — Schedule Your Free Inspection',
-          body: emailBody
-        });
-
-        if (leadId) {
-          try {
-            const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }, null, 1);
-            const lead = leads?.[0] || null;
-            if (lead) {
-              const notes = `${lead.notes || ''}\n[QUOTE_EMAIL_SENT] ${new Date().toISOString()}`.trim();
-              await base44.asServiceRole.entities.Lead.update(leadId, { notes });
-            }
-          } catch (noteErr) {
-            console.warn('FPQ_V2_QUOTE_EMAIL_NOTE_FAILED', { error: noteErr.message });
-          }
-        }
-
-        console.log('FPQ_V2_QUOTE_EMAIL_SENT', { leadId, token: token.trim().slice(0, 8) });
-      } catch (emailErr) {
-        console.warn('FPQ_V2_QUOTE_EMAIL_FAILED', { error: emailErr.message, token: token.trim().slice(0, 8) });
-      }
+      await sendQuoteReadyEmail({
+        quoteToken: token.trim(),
+        summary: priceSummary,
+        targetLeadId: leadId || null
+      });
     } catch (e) {
       console.error('FPQ_V2_PERSIST_FAILED', { error: e.message });
       // Don't fail the response; still return the computed quote
     }
 
     const response = {
       success: true,
       quoteToken: token.trim(),
       leadId: leadId || null,
       firstName: firstName,
       email,
       priceSummary,
       persisted: !!persistedQuote,
       build: BUILD
     };
 
     return json200(response);
 
   } catch (error) {
     console.error('FPQ_V2_CRASH', { error: error?.message });
     return json200({
       success: false,
       error: 'Quote finalization failed',
       detail: error?.message,
       build: BUILD
