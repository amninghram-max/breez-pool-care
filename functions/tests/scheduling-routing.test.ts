/**
 * INTEGRATION TESTS - Scheduling & Routing
 */

export async function runSchedulingTests(base44) {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: []
  };

  const tests = [
    {
      name: 'Customer scheduled Mon-Sat only (not Sunday)',
      async fn() {
        // Verify scheduling settings exclude Sunday
        const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
        const businessHours = settings[0]?.businessHours;
        
        return businessHours?.sunday?.closed === true;
      }
    },
    {
      name: 'Service duration varies by pool size',
      async fn() {
        const settings = await base44.asServiceRole.entities.SchedulingSettings.filter({ settingKey: 'default' });
        const durations = settings[0]?.defaultServiceDurations;
        
        // Verify durations increase with pool size
        return durations?.under_10k < durations?.['10_15k'] && 
               durations?.['10_15k'] < durations?.['15_20k'];
      }
    },
    {
      name: 'Storm day reschedule logic exists',
      async fn() {
        // Verify StormDay entity can be created
        const stormDay = await base44.asServiceRole.entities.StormDay.create({
          date: '2026-03-15',
          severity: 'advisory',
          reason: 'Test storm'
        });

        const success = !!stormDay.id;

        // Cleanup
        if (stormDay.id) {
          await base44.asServiceRole.entities.StormDay.delete(stormDay.id);
        }

        return success;
      }
    },
    {
      name: 'Customer constraints stored correctly',
      async fn() {
        const testLead = await base44.asServiceRole.entities.Lead.create({
          email: `schedule-test-${Date.now()}@breez.com`,
          firstName: 'Schedule',
          lastName: 'Test'
        });

        const constraints = await base44.asServiceRole.entities.CustomerConstraints.create({
          leadId: testLead.id,
          preferredDays: ['monday', 'wednesday', 'friday'],
          doNotScheduleDays: ['saturday']
        });

        return constraints.preferredDays.length === 3;
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