# Breez Pool Care – AI Bootstrap Context
# Authoritative architecture constraints for pricing + release system

SYSTEM_NAME: Breez Pool Care Platform

------------------------------------------------------------------
CORE INVARIANTS (DO NOT MODIFY WITHOUT EXPLICIT APPROVAL)
------------------------------------------------------------------

1. Production pricing MUST NOT run on hardcoded defaults.
2. AdminSettings is the single source of truth for pricing config.
3. Config must be loaded using:
   AdminSettings.list('-created_date', 1)
4. If no AdminSettings record exists:
   - calculateQuote returns 503
   - checkReleaseReadiness returns releaseReady=false
5. No silent fallback in production.
6. Release readiness must be fully inline (no backend function calling other backend functions).
7. Pricing engine must remain deterministic.
8. Historical quotes must remain immutable and auditable.

------------------------------------------------------------------
PRICING ENGINE MODEL
------------------------------------------------------------------

MonthlyPrice =
    BaseTier
  + AdditiveTokens
  + RiskAddon
  × FrequencyMultiplier

------------------------------------------------------------------
SIZE TIERS (Base Monthly)
------------------------------------------------------------------

Tier A (10–15k): 140
Tier B: 160
Tier C: 190
Tier D: 230

------------------------------------------------------------------
ADDITIVE TOKENS
------------------------------------------------------------------

Unscreened:
  Tier A: +20
  Tier B: +25
  Tier C: +30
  Tier D: +40

Trees (only if unscreened): +10

Usage:
  Rarely: 0
  Weekends / Several per week: +10
  Daily: +20

Chlorination:
  Inline / Salt: 0
  Floater / Skimmer: +5 per tier step
  Liquid only: +10

Pets:
  Occasional: +5
  Frequent: +10

------------------------------------------------------------------
RISK ENGINE
------------------------------------------------------------------

rawRisk × size multiplier:

Tier B: 1.1
Tier C: 1.2
Tier D: 1.3

Risk Brackets:

0–2     → 0
3–5     → 15
6–8     → 30
9–11    → 45
12+     → 60

If adjustedRisk >= 9:
  frequency = twice_weekly
  multiplier = 1.8

Twice weekly overrides weekly.

------------------------------------------------------------------
GREEN-TO-CLEAN MATRIX
------------------------------------------------------------------

Light:
  Small: 60
  Medium: 100
  Large: 150

Moderate:
  Small: 100
  Medium: 150
  Large: 200

Black:
  Small: 250
  Medium: 350
  Large: 450

Slightly Cloudy: 25

------------------------------------------------------------------
VERSIONING
------------------------------------------------------------------

PRICING_ENGINE_VERSION = "v2_tokens_risk_frequency"

Every checkReleaseReadiness response must include:
  pricingEngineVersion
  configRecordId
  configUpdatedAt
  timestamp

Every Quote record must store:
  pricingEngineVersion
  configRecordId

Customer must NOT see internal version or config fields.

------------------------------------------------------------------
RELEASE READINESS REQUIREMENTS
------------------------------------------------------------------

Must verify:

- AdminSettings present
- Risk bracket count = 5
- Multipliers exist
- Token definitions valid
- Pricing floor enforced (>= 120)
- Risk escalation functioning
- Entity layer reachable

Return structure must include:
  releaseReady
  usingDefaults
  blockers[]
  warnings[]
  pricingEngineVersion
  configRecordId
  configUpdatedAt

------------------------------------------------------------------
ARCHITECTURAL CONSTRAINTS
------------------------------------------------------------------

- No backend function invoking other backend functions.
- No divergent config loaders.
- No RLS rules blocking AdminSettings reads.
- No nondeterministic pricing logic.
- Quotes must be stateless and regenerable.
- Quotes should expire (recommended 14 days).

------------------------------------------------------------------
FUTURE EXPANSION (MUST NOT BREAK ABOVE RULES)
------------------------------------------------------------------

Planned systems:
- Weather-based adjustments
- Chemical dosing intelligence
- Pump runtime optimization
- Pool performance learning

Future systems must:
- Not modify historical quotes
- Not bypass versioning
- Not bypass AdminSettings config loading
- Not bypass release gating
