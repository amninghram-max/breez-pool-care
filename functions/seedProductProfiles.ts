import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const BUILT_IN_PROFILES = [
  {
    chemicalType: 'LIQUID_CHLORINE',
    name: '12% Liquid Chlorine',
    sku: 'LC-12-STANDARD',
    version: 1,
    strengthPercent: 12,
    labelFactor: 10.7, // fl oz per 10,000 gal per 1 ppm FC increase
    unit: 'gallons',
    isActive: true
  }
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth checkpoint
    const user = await base44.auth.me();
    if (!user) {
      console.warn('[seedProductProfiles] UNAUTHORIZED — no user');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      console.warn('[seedProductProfiles] FORBIDDEN — user role:', user.role);
      return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }
    console.info('[seedProductProfiles] AUTH_OK', { email: user.email });

    const results = [];

    for (const profile of BUILT_IN_PROFILES) {
      // Idempotency: look up by SKU
      console.info('[seedProductProfiles] LOOKUP_SKU', { sku: profile.sku });
      const existing = await base44.asServiceRole.entities.ProductProfile.filter({ sku: profile.sku }, null, 1);

      if (existing?.[0]) {
        console.info('[seedProductProfiles] REUSE_EXISTING', { sku: profile.sku, id: existing[0].id });
        results.push({ sku: profile.sku, action: 'reused', id: existing[0].id, profile: existing[0] });
        continue;
      }

      // Create new
      console.info('[seedProductProfiles] CREATING', { sku: profile.sku });
      const created = await base44.asServiceRole.entities.ProductProfile.create(profile);
      console.info('[seedProductProfiles] CREATED_OK', { sku: profile.sku, id: created.id });
      results.push({ sku: profile.sku, action: 'created', id: created.id, profile: created });
    }

    console.info('[seedProductProfiles] SUCCESS', { count: results.length });
    return Response.json({ ok: true, results });

  } catch (error) {
    console.error('[seedProductProfiles] CRASH', { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
});