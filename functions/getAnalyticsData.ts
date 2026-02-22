import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dashboard, startDate, endDate, technician, city, zipCode } = await req.json();

    const filters = {
      timestamp: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        $lte: endDate || new Date().toISOString()
      }
    };

    if (technician) filters.technicianName = technician;
    if (city) filters.city = city;
    if (zipCode) filters.zipCode = zipCode;

    switch (dashboard) {
      case 'sales': {
        const events = await base44.asServiceRole.entities.AnalyticsEvent.filter({
          eventType: {
            $in: ['QuoteStarted', 'QuoteCompleted', 'InspectionScheduled', 'InspectionConfirmed', 'ConvertedToRecurring', 'LostLead', 'DisqualifiedLead']
          },
          ...filters
        });

        const funnelData = {
          quoteStarted: events.filter(e => e.eventType === 'QuoteStarted').length,
          quoteCompleted: events.filter(e => e.eventType === 'QuoteCompleted').length,
          inspectionScheduled: events.filter(e => e.eventType === 'InspectionScheduled').length,
          inspectionConfirmed: events.filter(e => e.eventType === 'InspectionConfirmed').length,
          converted: events.filter(e => e.eventType === 'ConvertedToRecurring').length,
          lost: events.filter(e => e.eventType === 'LostLead').length,
          disqualified: events.filter(e => e.eventType === 'DisqualifiedLead').length
        };

        const lostReasons = events
          .filter(e => e.eventType === 'LostLead' && e.metadata?.reason)
          .reduce((acc, e) => {
            acc[e.metadata.reason] = (acc[e.metadata.reason] || 0) + 1;
            return acc;
          }, {});

        return Response.json({ funnelData, lostReasons });
      }

      case 'revenue': {
        const events = await base44.asServiceRole.entities.AnalyticsEvent.filter({
          eventType: {
            $in: ['InvoiceCreated', 'InvoicePaid', 'AutopayEnabled', 'AutopayDisabled', 'PaymentFailed', 'ServiceSuspended', 'Reinstated']
          },
          ...filters
        });

        const revenueByMonth = {};
        const autopayStats = {
          enabled: events.filter(e => e.eventType === 'AutopayEnabled').length,
          disabled: events.filter(e => e.eventType === 'AutopayDisabled').length
        };

        events.filter(e => e.eventType === 'InvoicePaid').forEach(e => {
          const month = e.timestamp.substring(0, 7);
          revenueByMonth[month] = (revenueByMonth[month] || 0) + (e.amount || 0);
        });

        const failureReasons = events
          .filter(e => e.eventType === 'PaymentFailed' && e.metadata?.declineCode)
          .reduce((acc, e) => {
            acc[e.metadata.declineCode] = (acc[e.metadata.declineCode] || 0) + 1;
            return acc;
          }, {});

        return Response.json({ revenueByMonth, autopayStats, failureReasons });
      }

      case 'operations': {
        const events = await base44.asServiceRole.entities.AnalyticsEvent.filter({
          eventType: {
            $in: ['ServiceVisitCompleted', 'ServiceVisitRescheduled', 'CouldNotAccess', 'RouteOptimized']
          },
          ...filters
        });

        const jobsByDay = {};
        const rescheduleReasons = {};
        const accessIssues = {};

        events.filter(e => e.eventType === 'ServiceVisitCompleted').forEach(e => {
          const day = e.timestamp.substring(0, 10);
          if (!jobsByDay[day]) jobsByDay[day] = {};
          const tech = e.technicianName || 'Unknown';
          jobsByDay[day][tech] = (jobsByDay[day][tech] || 0) + 1;
        });

        events.filter(e => e.eventType === 'ServiceVisitRescheduled' && e.metadata?.reason).forEach(e => {
          rescheduleReasons[e.metadata.reason] = (rescheduleReasons[e.metadata.reason] || 0) + 1;
        });

        events.filter(e => e.eventType === 'CouldNotAccess' && e.metadata?.reason).forEach(e => {
          accessIssues[e.metadata.reason] = (accessIssues[e.metadata.reason] || 0) + 1;
        });

        return Response.json({ jobsByDay, rescheduleReasons, accessIssues });
      }

      case 'chemistry': {
        const events = await base44.asServiceRole.entities.AnalyticsEvent.filter({
          eventType: {
            $in: ['ChemistryReadingsLogged', 'OutOfRangeReading', 'GreenPoolRecoveryTierAssigned']
          },
          ...filters
        });

        const outOfRangeByMetric = {};
        events.filter(e => e.eventType === 'OutOfRangeReading' && e.metadata?.metric).forEach(e => {
          outOfRangeByMetric[e.metadata.metric] = (outOfRangeByMetric[e.metadata.metric] || 0) + 1;
        });

        const greenPoolCount = events.filter(e => e.eventType === 'GreenPoolRecoveryTierAssigned').length;
        const readingsLogged = events.filter(e => e.eventType === 'ChemistryReadingsLogged').length;

        return Response.json({ outOfRangeByMetric, greenPoolCount, readingsLogged });
      }

      case 'support': {
        const events = await base44.asServiceRole.entities.AnalyticsEvent.filter({
          eventType: {
            $in: ['FAQViewed', 'AIChatStarted', 'AIResolved', 'EscalatedToHuman', 'HumanResponse', 'TicketClosed']
          },
          ...filters
        });

        const supportStats = {
          faqViews: events.filter(e => e.eventType === 'FAQViewed').length,
          aiChats: events.filter(e => e.eventType === 'AIChatStarted').length,
          aiResolved: events.filter(e => e.eventType === 'AIResolved').length,
          escalated: events.filter(e => e.eventType === 'EscalatedToHuman').length,
          humanResponses: events.filter(e => e.eventType === 'HumanResponse').length
        };

        // Calculate average response time
        const escalations = events.filter(e => e.eventType === 'EscalatedToHuman');
        const responses = events.filter(e => e.eventType === 'HumanResponse');
        
        let totalResponseTime = 0;
        let responseCount = 0;
        
        escalations.forEach(esc => {
          const response = responses.find(r => r.leadId === esc.leadId && r.timestamp > esc.timestamp);
          if (response) {
            const responseTime = (new Date(response.timestamp) - new Date(esc.timestamp)) / (1000 * 60 * 60);
            totalResponseTime += responseTime;
            responseCount++;
          }
        });

        supportStats.avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;

        return Response.json(supportStats);
      }

      default:
        return Response.json({ error: 'Invalid dashboard type' }, { status: 400 });
    }

  } catch (error) {
    console.error('Get analytics data error:', error);
    return Response.json({ 
      error: error.message || 'Failed to fetch analytics'
    }, { status: 500 });
  }
});