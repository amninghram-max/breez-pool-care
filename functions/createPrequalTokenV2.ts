/**
 * createPrequalTokenV2
 * Public endpoint (no auth required) to mint a prequal token.
 * 
 * Creates a QuoteRequests record with a random token.
 * Subsequent PreQualification form fills will be tied to this token.
 * 
 * Input: {} (no parameters)
 * Output: { success: true, token } or { success: false, error: '...' }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const json200 = (data) => new Response(
  JSON.stringify(data),
  { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Generate a cryptographically-random token
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    console.log('[createPrequalTokenV2] Generated token:', token.slice(0, 8) + '...');
    
    // Create minimal QuoteRequests record
    // Fields: email, firstName are null initially; user fills them during form completion
    try {
      const record = await base44.asServiceRole.entities.QuoteRequests.create({
        token: token.trim(),
        status: 'pending',
        source: 'prequal_wizard',
        email: null,
        firstName: null,
        leadId: null
      });
      console.log('[createPrequalTokenV2] Created QuoteRequests record:', record.id);
    } catch (createErr) {
      console.error('[createPrequalTokenV2] Failed to create QuoteRequests record:', createErr.message);
      return json200({
        success: false,
        error: 'Failed to initialize quote session'
      });
    }
    
    return json200({
      success: true,
      token: token.trim()
    });
  } catch (error) {
    console.error('[createPrequalTokenV2] Crash:', error?.message);
    return json200({
      success: false,
      error: 'Token creation failed'
    });
  }
});