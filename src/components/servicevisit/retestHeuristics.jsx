/**
 * Determines if a chemical dose warrants a retest prompt and returns details
 */
export function getRetestEligibility(dose, wasSuggested, suggestionReason) {
  const { serviceVisitKey, amount, unit } = dose;

  // A) pH/Alkalinity adjustment chemicals
  if (serviceVisitKey === 'acid' || serviceVisitKey === 'bakingSoda') {
    return {
      eligible: true,
      minutes: 60,
      reason: 'pH/TA adjustment logged – retest to verify target range.'
    };
  }

  // B) Significant chlorine addition
  if (serviceVisitKey === 'liquidChlorine' || serviceVisitKey === 'chlorineTablets') {
    // Check if user used suggested dose AND reason indicates raising FC from low
    if (wasSuggested && suggestionReason?.toLowerCase().includes('raise')) {
      return {
        eligible: true,
        minutes: 90,
        reason: 'Significant chlorine addition logged – retest in 90 min.'
      };
    }

    // Check if amount exceeds threshold
    const thresholds = {
      gal: 0.5,
      qt: 2,
      oz: 64,
      tablet: 2
    };

    const threshold = thresholds[unit] || Infinity;
    if (amount >= threshold) {
      return {
        eligible: true,
        minutes: 90,
        reason: 'Significant chlorine addition logged – retest in 90 min.'
      };
    }
  }

  // C) Problem chemicals (slow/impactful)
  if (serviceVisitKey === 'phosphateRemover' || serviceVisitKey === 'algaecide') {
    return {
      eligible: true,
      minutes: 90,
      reason: `${serviceVisitKey === 'phosphateRemover' ? 'Phosphate' : 'Algaecide'} treatment logged – retest in 90 min.`
    };
  }

  // Do NOT prompt for salt or stabilizer
  return { eligible: false };
}