import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { propertyId } = payload;

    // Fetch property and admin settings
    const property = await base44.entities.Property.get(propertyId);
    const adminSettings = await base44.asServiceRole.entities.AdminSettings.filter({
      settingKey: 'default'
    });
    const config = adminSettings[0] || getDefaultConfig();

    // Calculate pricing
    const pricingResult = calculatePricing(property, config);

    // Calculate risk score
    const riskResult = calculateRiskScore(property, config);

    // Create Quote
    const quote = await base44.entities.Quote.create({
      propertyId,
      clientEmail: user.email,
      status: 'draft',
      monthlyBasePrice: pricingResult.finalMonthlyPrice,
      perVisitPrice: pricingResult.perVisitPrice,
      recommendedFrequency: 'weekly',
      estimatedChemicalCOGS: pricingResult.finalMonthlyPrice * 0.35,
      riskScore: riskResult.riskScore,
      chemDemandIndex: riskResult.riskScore + 10,
      seasonalMultiplier: 1.0,
      grossMarginPercent: 55
    });

    // Create QuoteBreakdown
    await base44.entities.QuoteBreakdown.create({
      quoteId: quote.id,
      propertyId,
      baseMonthlyPrice: pricingResult.baseMonthlyPrice,
      modifiers: pricingResult.modifiers,
      totalModifiers: pricingResult.totalModifiers,
      finalMonthlyPrice: pricingResult.finalMonthlyPrice,
      perVisitPrice: pricingResult.perVisitPrice,
      startupAddOns: pricingResult.startupAddOns,
      totalStartupAddOns: pricingResult.totalStartupAddOns,
      topThreeFactors: pricingResult.topThreeFactors
    });

    // Create RiskScoreFactors
    await base44.entities.RiskScoreFactors.create({
      quoteId: quote.id,
      propertyId,
      riskScore: riskResult.riskScore,
      riskLevel: riskResult.riskLevel,
      factorBreakdown: riskResult.factorBreakdown,
      topFiveFactors: riskResult.topFiveFactors
    });

    return Response.json({
      success: true,
      quote,
      pricing: pricingResult,
      risk: riskResult,
      technicianSummary: generateTechnicianSummary(property, pricingResult, riskResult)
    });
  } catch (error) {
    console.error('Quote calculation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getDefaultConfig() {
  return {
    baseMonthlyPrice: 299,
    modifiers: {
      pool_size: { under_10k: 0, '10_15k': 25, '15_20k': 50, '20_30k': 100, over_30k: 150, not_sure: 35 },
      enclosure: { partially_screened: 30, unscreened: 60 },
      nearby_factors: { trees_overhead: 15, heavy_debris: 20, pollen: 10, waterfront: 25, construction: 10 },
      filter: { cartridge: 20, de: 35 },
      use_frequency: { several_per_week: 20, daily: 45 },
      pets_swim: { occasionally: 20, frequently: 40 },
      condition: { slightly_cloudy: 45, green_algae: 150, not_sure: 75 },
      issues: { equipment: 50, leaks: 80, staining: 30 }
    },
    risk_weights: {
      enclosure: { partially_screened: 8, unscreened: 15 },
      nearby: { trees_overhead: 10, heavy_debris: 12, pollen: 6, waterfront: 15, construction: 8 },
      use_frequency: { several_per_week: 6, daily: 10 },
      pets_swim: { occasionally: 6, frequently: 12 },
      condition: { slightly_cloudy: 10, green_algae: 25, not_sure: 8 },
      filter: { cartridge: 6, de: 8 },
      issues: { equipment: 10, leaks: 15, staining: 6 },
      access: { hoa_community: 5, locked_gate: 5, code_required: 3 }
    }
  };
}

function calculatePricing(property, config) {
  const modifiers = [];
  let totalModifiers = 0;
  const topFactors = [];

  const basePrice = config.baseMonthlyPrice || 299;

  // Pool size
  if (property.poolSizeBucket) {
    const amount = config.modifiers.pool_size[property.poolSizeBucket] || 0;
    if (amount > 0) {
      modifiers.push({ name: 'Pool Size', category: 'pool_size', amount, enabled: true, description: `${property.poolSizeBucket}` });
      totalModifiers += amount;
      topFactors.push({ factor: `Pool: ${property.poolSizeBucket}`, amount });
    }
  }

  // Enclosure
  if (property.enclosure && property.enclosure !== 'fully_screened' && property.enclosure !== 'indoor') {
    const amount = config.modifiers.enclosure[property.enclosure] || 0;
    if (amount > 0) {
      modifiers.push({ name: 'Enclosure', category: 'enclosure', amount, enabled: true, description: property.enclosure });
      totalModifiers += amount;
      topFactors.push({ factor: `${property.enclosure}`, amount });
    }
  }

  // Nearby factors
  if (property.nearbyFactors && Array.isArray(property.nearbyFactors)) {
    let debrisTotal = 0;
    property.nearbyFactors.forEach(factor => {
      const amount = config.modifiers.nearby_factors[factor] || 0;
      if (amount > 0) {
        debrisTotal += amount;
        topFactors.push({ factor, amount });
      }
    });
    if (debrisTotal > 0) {
      const capAmount = Math.min(debrisTotal, 50); // Cap debris at $50
      modifiers.push({ name: 'Debris/Environmental', category: 'debris', amount: capAmount, enabled: true, description: property.nearbyFactors.join(', ') });
      totalModifiers += capAmount;
    }
  }

  // Filter type
  if (property.filterType && property.filterType !== 'sand' && property.filterType !== 'not_sure') {
    const amount = config.modifiers.filter[property.filterType] || 0;
    if (amount > 0) {
      modifiers.push({ name: 'Filter Type', category: 'filter', amount, enabled: true, description: property.filterType });
      totalModifiers += amount;
      topFactors.push({ factor: `${property.filterType} filter`, amount });
    }
  }

  // Use frequency
  if (property.useFrequency && property.useFrequency !== 'rarely' && property.useFrequency !== 'weekends') {
    const amount = config.modifiers.use_frequency[property.useFrequency] || 0;
    if (amount > 0) {
      modifiers.push({ name: 'Usage Frequency', category: 'usage', amount, enabled: true, description: property.useFrequency });
      totalModifiers += amount;
      topFactors.push({ factor: `${property.useFrequency} use`, amount });
    }
  }

  // Pets swim
  if (property.petsAccess && property.petsSwimFrequency) {
    const amount = config.modifiers.pets_swim[property.petsSwimFrequency] || 0;
    if (amount > 0) {
      modifiers.push({ name: 'Pet Access', category: 'pets', amount, enabled: true, description: `Pets swim ${property.petsSwimFrequency}` });
      totalModifiers += amount;
      topFactors.push({ factor: `Pets (${property.petsSwimFrequency})`, amount });
    }
  }

  // Condition & startup add-ons
  const startupAddOns = [];
  if (property.currentCondition === 'green_algae' || property.currentCondition === 'slightly_cloudy' || property.currentCondition === 'not_sure') {
    const condAmount = config.modifiers.condition[property.currentCondition] || 0;
    if (condAmount > 0) {
      startupAddOns.push({
        name: property.currentCondition === 'green_algae' ? 'Green-to-Clean Startup' : 'First Service Inspection',
        amount: condAmount,
        reason: `Pool condition: ${property.currentCondition}`
      });
      topFactors.push({ factor: `Condition: ${property.currentCondition}`, amount: condAmount });
    }
  }

  // Known issues - inspection fee
  if (property.knownIssues && Array.isArray(property.knownIssues) && property.knownIssues.length > 0) {
    let issueAmount = 0;
    property.knownIssues.forEach(issue => {
      const amount = config.modifiers.issues[issue] || 0;
      if (amount > 0) issueAmount += amount;
    });
    if (issueAmount > 0) {
      startupAddOns.push({
        name: 'Diagnostic/Inspection Fee',
        amount: issueAmount,
        reason: `Known issues: ${property.knownIssues.join(', ')}`
      });
    }
  }

  const totalStartupAddOns = startupAddOns.reduce((sum, addon) => sum + addon.amount, 0);
  const finalMonthlyPrice = basePrice + totalModifiers;
  const perVisitPrice = finalMonthlyPrice / 4.3; // Approx 4.3 visits/month for weekly

  // Top 3 factors
  const topThree = topFactors
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map(f => f.factor);

  return {
    baseMonthlyPrice: basePrice,
    modifiers,
    totalModifiers,
    finalMonthlyPrice: Math.round(finalMonthlyPrice * 100) / 100,
    perVisitPrice: Math.round(perVisitPrice * 100) / 100,
    startupAddOns,
    totalStartupAddOns,
    topThreeFactors: topThree
  };
}

function calculateRiskScore(property, config) {
  let riskScore = 40; // baseline
  const factorBreakdown = [];

  const addFactor = (name, weight, enabled = true) => {
    if (enabled) {
      riskScore += weight;
      factorBreakdown.push({ factor: name, weight, contribution: weight, enabled: true });
    }
  };

  // Enclosure
  if (property.enclosure === 'partially_screened') {
    addFactor('Partially Screened', config.risk_weights.enclosure.partially_screened);
  } else if (property.enclosure === 'unscreened') {
    addFactor('Unscreened', config.risk_weights.enclosure.unscreened);
  }

  // Nearby factors
  if (property.nearbyFactors && Array.isArray(property.nearbyFactors)) {
    property.nearbyFactors.forEach(factor => {
      const weight = config.risk_weights.nearby[factor] || 0;
      if (weight > 0) addFactor(factor, weight);
    });
  }

  // Use frequency
  if (property.useFrequency === 'several_per_week') {
    addFactor('Several/week usage', config.risk_weights.use_frequency.several_per_week);
  } else if (property.useFrequency === 'daily') {
    addFactor('Daily usage', config.risk_weights.use_frequency.daily);
  }

  // Pets
  if (property.petsAccess && property.petsSwimFrequency) {
    addFactor(`Pets swim ${property.petsSwimFrequency}`, config.risk_weights.pets_swim[property.petsSwimFrequency] || 0);
  }

  // Condition
  if (property.currentCondition && property.currentCondition !== 'clear' && property.currentCondition !== 'recently_treated') {
    addFactor(`Condition: ${property.currentCondition}`, config.risk_weights.condition[property.currentCondition] || 0);
  }

  // Filter
  if (property.filterType === 'cartridge') {
    addFactor('Cartridge Filter', config.risk_weights.filter.cartridge);
  } else if (property.filterType === 'de') {
    addFactor('DE Filter', config.risk_weights.filter.de);
  }

  // Known issues
  if (property.knownIssues && Array.isArray(property.knownIssues)) {
    property.knownIssues.forEach(issue => {
      const weight = config.risk_weights.issues[issue] || 0;
      if (weight > 0) addFactor(`Issue: ${issue}`, weight);
    });
  }

  // Access
  if (property.accessType === 'hoa_community' || property.accessType === 'locked_gate') {
    addFactor(`Access: ${property.accessType}`, config.risk_weights.access[property.accessType] || 0);
  } else if (property.accessType === 'code_required') {
    addFactor('Access: code required', config.risk_weights.access.code_required);
  }

  riskScore = Math.min(Math.max(riskScore, 0), 100); // Cap 0-100

  const topFive = factorBreakdown
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5)
    .map(f => f.factor);

  const riskLevel = riskScore < 34 ? 'low' : riskScore < 67 ? 'medium' : 'high';

  return {
    riskScore: Math.round(riskScore),
    riskLevel,
    factorBreakdown,
    topFiveFactors: topFive
  };
}

function generateTechnicianSummary(property, pricing, risk) {
  const size = property.poolSizeBucket?.replace(/_/g, '-') || 'Unknown';
  const type = property.poolType?.replace(/_/g, ' ') || 'Unknown';
  const enclosure = property.enclosure?.replace(/_/g, ' ') || 'Unknown';
  const filter = property.filterType || 'Unknown';
  const sanitizer = property.chlorinationMethod?.replace(/_/g, ' ') || 'Unknown';
  const chlorinatorInfo = property.chlorinatorType ? ` (${property.chlorinatorType.replace(/_/g, ' ')})` : '';
  const usage = property.useFrequency?.replace(/_/g, ' ') || 'Unknown';
  const pets = property.petsAccess ? `Yes (${property.petsSwimFrequency || 'occasionally'})` : 'No';
  const condition = property.currentCondition?.replace(/_/g, ' ') || 'Unknown';
  const issues = property.knownIssues?.length ? property.knownIssues.join(', ') : 'None';
  const features = property.equipmentFeatures?.length ? property.equipmentFeatures.join(', ') : 'None';
  const access = property.accessType?.replace(/_/g, ' ') || 'Unknown';
  const notes = property.accessNotes || '(See account notes)';

  const summary = `PROPERTY SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pool Size: ${size} gal
Type: ${type} | Enclosure: ${enclosure}
Filter: ${filter} | Sanitizer: ${sanitizer}${chlorinatorInfo}
Usage: ${usage} | Pets: ${pets}
Condition: ${condition}
Known Issues: ${issues}
Equipment/Features: ${features}
Access: ${access}
Notes: ${notes}

RISK ASSESSMENT
Risk Score: ${risk.riskScore} (${risk.riskLevel.toUpperCase()})
Top Drivers: ${risk.topFiveFactors.slice(0, 3).join(' • ')}

QUOTE SUMMARY
Monthly: $${pricing.finalMonthlyPrice} | Per-Visit: $${pricing.perVisitPrice}
Startup/Add-ons: ${pricing.totalStartupAddOns > 0 ? `$${pricing.totalStartupAddOns}` : 'None'}
Top Factors: ${pricing.topThreeFactors.join(' • ')}`;

  return summary;
}