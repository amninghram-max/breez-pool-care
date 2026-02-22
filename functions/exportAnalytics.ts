import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { exportType, startDate, endDate } = await req.json();

    const dateFilter = {
      $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      $lte: endDate || new Date().toISOString()
    };

    let csvContent = '';

    switch (exportType) {
      case 'events': {
        const events = await base44.asServiceRole.entities.AnalyticsEvent.filter({
          timestamp: dateFilter
        });
        
        csvContent = 'Timestamp,Event Type,Lead ID,Technician,City,ZIP,Amount,Metadata\n';
        events.forEach(e => {
          csvContent += `${e.timestamp},${e.eventType},${e.leadId || ''},${e.technicianName || ''},${e.city || ''},${e.zipCode || ''},${e.amount || ''},${JSON.stringify(e.metadata || {})}\n`;
        });
        break;
      }

      case 'invoices': {
        const invoices = await base44.asServiceRole.entities.Invoice.filter({
          issueDate: dateFilter
        });
        
        csvContent = 'Invoice Number,Lead ID,Status,Type,Amount,Issue Date,Due Date,Paid Date\n';
        invoices.forEach(inv => {
          csvContent += `${inv.invoiceNumber || ''},${inv.leadId},${inv.status},${inv.invoiceType},${inv.amount},${inv.issueDate},${inv.dueDate || ''},${inv.paidDate || ''}\n`;
        });
        break;
      }

      case 'visits': {
        const visits = await base44.asServiceRole.entities.ServiceVisit.filter({
          visitDate: dateFilter
        });
        
        csvContent = 'Visit Date,Property ID,Technician,Free Chlorine,pH,Total Alkalinity,Notes\n';
        visits.forEach(v => {
          csvContent += `${v.visitDate},${v.propertyId},${v.technicianName || ''},${v.freeChlorine || ''},${v.pH || ''},${v.totalAlkalinity || ''},"${v.notes || ''}"\n`;
        });
        break;
      }

      case 'leads': {
        const leads = await base44.asServiceRole.entities.Lead.filter({
          created_date: dateFilter
        });
        
        csvContent = 'Name,Email,Phone,City,ZIP,Stage,Account Status,Created Date\n';
        leads.forEach(l => {
          csvContent += `${l.firstName} ${l.lastName || ''},${l.email},${l.mobilePhone},${l.city},${l.zipCode},${l.stage},${l.accountStatus},${l.created_date}\n`;
        });
        break;
      }

      default:
        return Response.json({ error: 'Invalid export type' }, { status: 400 });
    }

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${exportType}-export-${new Date().toISOString().split('T')[0]}.csv"`
      }
    });

  } catch (error) {
    console.error('Export analytics error:', error);
    return Response.json({ 
      error: error.message || 'Failed to export data'
    }, { status: 500 });
  }
});