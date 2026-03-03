import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * prelaunchResetCustomerDataV1
 * 
 * Admin-only prelaunch reset: soft-deletes leads, cancels inspections/events,
 * invalidates quote tokens, archives notifications.
 * 
 * Requires: dryRun (default true), confirm string for live execution.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['admin', 'staff'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: admin/staff only' }, { status: 403 });
    }

    const body = await req.json();
    const { dryRun = true, confirm = '' } = body;

    // Safety: require exact confirm string for live execution
    const isLiveExecution = !dryRun && confirm === 'RESET_PRELAUNCH_CUSTOMER_DATA';
    if (!dryRun && !isLiveExecution) {
      return Response.json({
        success: false,
        error: 'Live execution requires: dryRun=false AND confirm="RESET_PRELAUNCH_CUSTOMER_DATA"',
        dryRun: false,
        isPreview: true
      }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const counts = {
      leadsSoftDeleted: 0,
      inspectionsCancelled: 0,
      eventsCancelled: 0,
      reschedulesCancelled: 0,
      quoteTokensInvalidated: 0,
      notificationLogsArchived: 0
    };
    const warnings = [];

    // ── 1. Soft-delete all Leads ──
    try {
      const allLeads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
      const activeLeads = (allLeads || []).filter(l => !l.isDeleted);
      
      if (!dryRun && activeLeads.length > 0) {
        for (const lead of activeLeads) {
          await base44.asServiceRole.entities.Lead.update(lead.id, {
            isDeleted: true,
            deletedAt: timestamp,
            deletedBy: user.email,
            deleteReason: 'prelaunch_reset'
          });
        }
      }
      counts.leadsSoftDeleted = activeLeads.length;
      console.log('[prelaunchReset] Leads processed:', counts.leadsSoftDeleted);
    } catch (e) {
      warnings.push(`Lead soft-delete failed: ${e.message}`);
      console.error('[prelaunchReset] Lead error:', e.message);
    }

    // ── 2. Cancel all active InspectionRecords ──
    try {
      const allInspections = await base44.asServiceRole.entities.InspectionRecord.list('-created_date', 1000);
      const activeInspections = (allInspections || []).filter(i => 
        i.appointmentStatus !== 'cancelled' && i.finalizationStatus !== 'finalized'
      );
      
      if (!dryRun && activeInspections.length > 0) {
        for (const insp of activeInspections) {
          await base44.asServiceRole.entities.InspectionRecord.update(insp.id, {
            appointmentStatus: 'cancelled',
            cancelledAt: timestamp,
            cancelReason: 'prelaunch_reset'
          });
        }
      }
      counts.inspectionsCancelled = activeInspections.length;
      console.log('[prelaunchReset] Inspections processed:', counts.inspectionsCancelled);
    } catch (e) {
      warnings.push(`Inspection cancellation failed: ${e.message}`);
      console.error('[prelaunchReset] Inspection error:', e.message);
    }

    // ── 3. Cancel all active CalendarEvents ──
    try {
      const allEvents = await base44.asServiceRole.entities.CalendarEvent.list('-created_date', 1000);
      const activeEvents = (allEvents || []).filter(ev => ev.status !== 'cancelled');
      
      if (!dryRun && activeEvents.length > 0) {
        for (const ev of activeEvents) {
          await base44.asServiceRole.entities.CalendarEvent.update(ev.id, {
            status: 'cancelled',
            cancelledAt: timestamp,
            cancelReason: 'prelaunch_reset'
          });
        }
      }
      counts.eventsCancelled = activeEvents.length;
      console.log('[prelaunchReset] Events processed:', counts.eventsCancelled);
    } catch (e) {
      warnings.push(`Calendar event cancellation failed: ${e.message}`);
      console.error('[prelaunchReset] Event error:', e.message);
    }

    // ── 4. Cancel pending/approved RescheduleRequests ──
    try {
      const allRequests = await base44.asServiceRole.entities.RescheduleRequest.list('-created_date', 1000);
      const activeRequests = (allRequests || []).filter(r => 
        ['pending', 'approved'].includes(r.status)
      );
      
      if (!dryRun && activeRequests.length > 0) {
        for (const req of activeRequests) {
          await base44.asServiceRole.entities.RescheduleRequest.update(req.id, {
            status: 'cancelled',
            decisionNote: 'prelaunch_reset'
          });
        }
      }
      counts.reschedulesCancelled = activeRequests.length;
      console.log('[prelaunchReset] Reschedule requests processed:', counts.reschedulesCancelled);
    } catch (e) {
      warnings.push(`Reschedule request cancellation failed: ${e.message}`);
      console.error('[prelaunchReset] Reschedule error:', e.message);
    }

    // ── 5. Invalidate Quote scheduling tokens ──
    try {
      const allQuotes = await base44.asServiceRole.entities.Quote.list('-created_date', 1000);
      const quotesWithTokens = (allQuotes || []).filter(q => 
        q.scheduleToken && !q.scheduleTokenUsedAt
      );
      
      if (!dryRun && quotesWithTokens.length > 0) {
        for (const quote of quotesWithTokens) {
          await base44.asServiceRole.entities.Quote.update(quote.id, {
            scheduleTokenUsedAt: timestamp,
            scheduleTokenRevokedAt: timestamp
          });
        }
      }
      counts.quoteTokensInvalidated = quotesWithTokens.length;
      console.log('[prelaunchReset] Quote tokens invalidated:', counts.quoteTokensInvalidated);
    } catch (e) {
      warnings.push(`Quote token invalidation failed: ${e.message}`);
      console.error('[prelaunchReset] Quote error:', e.message);
    }

    // ── 6. Archive NotificationLogs (if archiving field exists; otherwise skip) ──
    try {
      const allLogs = await base44.asServiceRole.entities.NotificationLog.list('-created_date', 1000);
      // Check if first log has archive field capability (best effort)
      if (allLogs && allLogs.length > 0 && typeof allLogs[0].isArchived !== 'undefined') {
        const unarchivedLogs = allLogs.filter(log => !log.isArchived);
        if (!dryRun && unarchivedLogs.length > 0) {
          for (const log of unarchivedLogs) {
            await base44.asServiceRole.entities.NotificationLog.update(log.id, {
              isArchived: true
            });
          }
        }
        counts.notificationLogsArchived = unarchivedLogs.length;
      } else {
        warnings.push('NotificationLog archiving field not found; skipped.');
      }
      console.log('[prelaunchReset] Notification logs processed:', counts.notificationLogsArchived);
    } catch (e) {
      warnings.push(`Notification log archival failed: ${e.message}`);
      console.error('[prelaunchReset] Notification log error:', e.message);
    }

    // ── 7. Log immutable AnalyticsEvent ──
    try {
      await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: 'noop', // Placeholder; use logAnalyticsEvent pattern if available
      }).catch(() => null); // Graceful fail if not supported
      
      // Alternative: create via entity if available
      if (base44.asServiceRole.entities.AnalyticsEvent) {
        await base44.asServiceRole.entities.AnalyticsEvent.create({
          eventName: 'prelaunch_customer_data_reset',
          properties: {
            operator: user.email,
            dryRun,
            appliedLive: isLiveExecution,
            counts: JSON.stringify(counts),
            timestamp
          }
        }).catch(e => console.warn('[prelaunchReset] AnalyticsEvent failed:', e.message));
      }
    } catch (e) {
      console.warn('[prelaunchReset] Audit logging failed:', e.message);
    }

    const resultCode = dryRun ? 'PREVIEW' : 'APPLIED';
    console.log(`[prelaunchReset] Complete: ${resultCode}`, counts);

    return Response.json({
      success: true,
      dryRun,
      appliedLive: isLiveExecution,
      resultCode,
      counts,
      warnings: warnings.length > 0 ? warnings : undefined,
      timestamp
    });

  } catch (error) {
    console.error('[prelaunchReset] crash:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});