import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * STARTUP CONFIG VALIDATION
 * Validates AdminSettings integrity on server start or first pricing request
 * Auto-seeds if invalid, logs recovery event
 */

let validationComplete = false;

export async function validateAndSeedIfNeeded(base44) {
  if (validationComplete) return { valid: true, seeded: false };

  console.log('🔍 Validating AdminSettings integrity...');

  try {
    const settings = await base44.asServiceRole.entities.AdminSettings.filter({
      settingKey: 'default'
    });

    if (!settings || settings.length === 0) {
      console.warn('⚠️ AdminSettings not found - auto-seeding...');
      await autoSeed(base44);
      return { valid: true, seeded: true };
    }

    const config = settings[0];

    // Parse nested config
    let riskEngine, escalationBrackets, sizeMultipliers, tokens;
    try {
      riskEngine = JSON.parse(config.riskEngine);
      escalationBrackets = riskEngine?.escalation_brackets || [];
      sizeMultipliers = riskEngine?.size_multipliers || {};
      tokens = JSON.parse(config.additiveTokens || '{}');
    } catch (e) {
      console.error('❌ Failed to parse AdminSettings JSON - auto-seeding...');
      await autoSeed(base44);
      return { valid: true, seeded: true };
    }

    // Validate critical config elements
    const bracketsValid = escalationBrackets.length === 5;
    const multipliersValid = Object.keys(sizeMultipliers).length === 4;
    const tokensValid = Object.keys(tokens).length >= 10;

    if (!bracketsValid || !multipliersValid || !tokensValid) {
      console.error(`❌ AdminSettings integrity check FAILED:
        - Brackets: ${bracketsValid ? '✅' : '❌'} (${escalationBrackets.length}/5)
        - Multipliers: ${multipliersValid ? '✅' : '❌'} (${Object.keys(sizeMultipliers).length}/4)
        - Tokens: ${tokensValid ? '✅' : '❌'} (${Object.keys(tokens).length} keys)
      `);
      
      console.warn('⚠️ Auto-seeding AdminSettings...');
      await autoSeed(base44);
      return { valid: true, seeded: true };
    }

    console.log('✅ AdminSettings integrity check PASSED');
    validationComplete = true;
    return { valid: true, seeded: false };

  } catch (error) {
    console.error('❌ Config validation error:', error);
    // Don't auto-seed on errors, let function fail
    return { valid: false, seeded: false, error: error.message };
  }
}

async function autoSeed(base44) {
  try {
    const response = await base44.asServiceRole.functions.invoke('seedAdminSettingsDefault', {});
    
    if (response.data?.success) {
      console.log('✅ AdminSettings auto-seeded successfully');
      
      // Log integrity recovery event
      try {
        await base44.asServiceRole.entities.AnalyticsEvent.create({
          eventType: 'ConfigIntegrityRecovery',
          source: 'system',
          metadata: {
            action: 'auto_seeded',
            verification: response.data.verification,
            timestamp: new Date().toISOString()
          }
        });
      } catch (e) {
        console.error('Failed to log recovery event:', e);
      }
      
      validationComplete = true;
    } else {
      throw new Error('Seeding failed: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('❌ Auto-seed failed:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const result = await validateAndSeedIfNeeded(base44);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});