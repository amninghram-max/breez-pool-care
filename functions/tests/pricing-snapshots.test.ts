/**
 * CRITICAL PRICING SNAPSHOT TESTS
 * Golden fixtures - any change blocks deployment
 * Tests complete quote outputs against frozen baselines
 */

import { pricingFixtures } from './pricing-fixtures.js';

export async function runPricingSnapshotTests(base44) {
  const results = {
    name: 'pricing-snapshots',
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: [],
    snapshotMismatches: []
  };

  console.log('📸 Running CRITICAL pricing snapshot tests...');

  for (const fixture of pricingFixtures) {
    results.total++;
    
    try {
      // Call calculateQuote with fixture input
      const response = await base44.asServiceRole.functions.invoke('calculateQuote', {
        questionnaireData: fixture.input
      });

      const actual = response.data?.quote;
      if (!actual) {
        throw new Error('No quote returned from calculateQuote');
      }

      // Compare against expected values
      const mismatch = compareSnapshot(fixture.expected, actual);

      if (mismatch) {
        results.failed++;
        results.failures.push({
          test: `[FIXTURE] ${fixture.name}`,
          expected: fixture.expected,
          actual: extractRelevantFields(actual, fixture.expected),
          fixtureId: fixture.id,
          critical: true
        });
        
        results.snapshotMismatches.push({
          fixtureId: fixture.id,
          test: fixture.name,
          expected: fixture.expected,
          actual: extractRelevantFields(actual, fixture.expected),
          delta: calculateDelta(fixture.expected, actual)
        });
      } else {
        results.passed++;
      }

    } catch (error) {
      results.failed++;
      results.failures.push({
        test: `[FIXTURE] ${fixture.name}`,
        expected: fixture.expected,
        actual: null,
        stack: error.stack,
        fixtureId: fixture.id,
        critical: true
      });
    }
  }

  console.log(`📸 Snapshot tests: ${results.passed}/${results.total} passed`);
  if (results.snapshotMismatches.length > 0) {
    console.error(`🚨 ${results.snapshotMismatches.length} SNAPSHOT MISMATCHES - DEPLOYMENT BLOCKED`);
  }

  return results;
}

function compareSnapshot(expected, actual) {
  const fieldsToCheck = Object.keys(expected);
  
  for (const field of fieldsToCheck) {
    const expectedValue = expected[field];
    const actualValue = actual[field];

    // Deep comparison for arrays
    if (Array.isArray(expectedValue)) {
      if (!arraysEqual(expectedValue, actualValue)) {
        return true;
      }
    }
    // Numeric comparison with tolerance
    else if (typeof expectedValue === 'number') {
      if (Math.abs(actualValue - expectedValue) > 0.01) {
        return true;
      }
    }
    // Direct comparison
    else {
      if (actualValue !== expectedValue) {
        return true;
      }
    }
  }

  return false;
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  
  for (let i = 0; i < a.length; i++) {
    if (typeof a[i] === 'object') {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
    } else {
      if (a[i] !== b[i]) return false;
    }
  }
  
  return true;
}

function extractRelevantFields(actual, expected) {
  const relevant = {};
  for (const field of Object.keys(expected)) {
    relevant[field] = actual[field];
  }
  return relevant;
}

function calculateDelta(expected, actual) {
  const delta = {};
  
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[field];
    
    if (typeof expectedValue === 'number' && typeof actualValue === 'number') {
      const diff = actualValue - expectedValue;
      delta[field] = {
        expected: expectedValue,
        actual: actualValue,
        diff: diff,
        pctChange: expectedValue !== 0 ? ((diff / expectedValue) * 100).toFixed(2) + '%' : 'N/A'
      };
    } else if (expectedValue !== actualValue) {
      delta[field] = {
        expected: expectedValue,
        actual: actualValue,
        changed: true
      };
    }
  }
  
  return delta;
}