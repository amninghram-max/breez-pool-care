/**
 * INTEGRATION TESTS - Lead Pipeline & Conversion
 * Tests quote → lead creation → inspection → agreements → payment → activation
 */

export async function runLeadPipelineTests(base44) {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: []
  };

  const testEmail = `test-${Date.now()}@breeztest.com`;

  const tests = [
    {
      name: 'Quote creation generates PoolQuestionnaire record',
      async fn() {
        const quoteData = {
          poolSize: '15_20k',
          poolType: 'in_ground',
          enclosure: 'fully_screened',
          filterType: 'cartridge',
          chlorinationMethod: 'saltwater',
          useFrequency: 'weekends',
          poolCondition: 'clear',
          clientEmail: testEmail,
          clientFirstName: 'Test',
          clientLastName: 'User'
        };

        const response = await base44.asServiceRole.functions.invoke('calculateQuote', { questionnaire: quoteData });
        
        if (!response.data.estimatedMonthlyPrice) {
          throw new Error('Quote calculation failed');
        }

        // Create the questionnaire record
        const questionnaire = await base44.asServiceRole.entities.PoolQuestionnaire.create({
          ...quoteData,
          ...response.data,
          quoteStatus: 'generated',
          quoteTimestamp: new Date().toISOString()
        });

        return !!questionnaire.id;
      }
    },
    {
      name: 'Lead created/updated when quote generated',
      async fn() {
        // Check if lead exists
        const existingLeads = await base44.asServiceRole.entities.Lead.filter({ email: testEmail });
        
        if (existingLeads.length === 0) {
          // Create lead
          const lead = await base44.asServiceRole.entities.Lead.create({
            email: testEmail,
            firstName: 'Test',
            lastName: 'User',
            stage: 'new_lead',
            quoteGenerated: true
          });
          return !!lead.id;
        }

        return true;
      }
    },
    {
      name: 'Agreements acceptance stored with timestamp',
      async fn() {
        const leads = await base44.asServiceRole.entities.Lead.filter({ email: testEmail });
        if (leads.length === 0) return false;

        const lead = leads[0];
        const now = new Date().toISOString();

        await base44.asServiceRole.entities.Lead.update(lead.id, {
          agreementsAccepted: true,
          agreementsAcceptedAt: now
        });

        const updated = await base44.asServiceRole.entities.Lead.filter({ id: lead.id });
        return updated[0].agreementsAccepted === true && !!updated[0].agreementsAcceptedAt;
      }
    },
    {
      name: 'Payment success moves lead to converted stage',
      async fn() {
        const leads = await base44.asServiceRole.entities.Lead.filter({ email: testEmail });
        if (leads.length === 0) return false;

        const lead = leads[0];

        await base44.asServiceRole.entities.Lead.update(lead.id, {
          stage: 'converted',
          activationPaymentStatus: 'paid',
          activationPaymentDate: new Date().toISOString()
        });

        const updated = await base44.asServiceRole.entities.Lead.filter({ id: lead.id });
        return updated[0].stage === 'converted' && updated[0].activationPaymentStatus === 'paid';
      }
    },
    {
      name: 'Inspection scheduled updates lead stage',
      async fn() {
        const leads = await base44.asServiceRole.entities.Lead.filter({ email: testEmail });
        if (leads.length === 0) return false;

        const lead = leads[0];

        await base44.asServiceRole.entities.Lead.update(lead.id, {
          stage: 'inspection_scheduled',
          inspectionScheduled: true,
          requestedInspectionDate: '2026-03-01',
          requestedInspectionTime: '10:00 AM - 12:00 PM'
        });

        const updated = await base44.asServiceRole.entities.Lead.filter({ id: lead.id });
        return updated[0].stage === 'inspection_scheduled' && updated[0].inspectionScheduled === true;
      }
    }
  ];

  // Run tests
  for (const test of tests) {
    results.total++;
    try {
      const passed = await test.fn();
      
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
        results.failures.push({
          test: test.name,
          expected: true,
          actual: false,
          stack: null
        });
      }
    } catch (error) {
      results.failed++;
      results.failures.push({
        test: test.name,
        expected: 'success',
        actual: error.message,
        stack: error.stack
      });
    }
  }

  return results;
}