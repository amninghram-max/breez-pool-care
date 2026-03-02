/**
 * Build a stable cache key from suggestion inputs
 */
export function buildSuggestionCacheKey(propertyId, serviceVisitKey, readings) {
  if (!propertyId || !serviceVisitKey) return null;

  // Normalize numeric readings to 2 decimals, treat null/undefined as empty
  const normalize = (val) => {
    if (val === null || val === undefined || val === '') return 'empty';
    const num = parseFloat(val);
    return isNaN(num) ? 'empty' : num.toFixed(2);
  };

  const fc = normalize(readings.freeChlorine);
  const ph = normalize(readings.pH);
  const ta = normalize(readings.totalAlkalinity);
  const cya = normalize(readings.cyanuricAcid);
  const ch = normalize(readings.calciumHardness);
  const salt = normalize(readings.salt);
  const phos = normalize(readings.phosphates);
  const temp = normalize(readings.waterTemp);

  return `${propertyId}|${serviceVisitKey}|fc:${fc}|ph:${ph}|ta:${ta}|cya:${cya}|ch:${ch}|salt:${salt}|pho:${phos}|t:${temp}`;
}

/**
 * Debounce suggestion fetch with caching and in-flight tracking
 * Returns: { debounceAndFetch, clearCache }
 */
export function createSuggestionFetcher(fetchFn, cacheRef, inFlightRef) {
  let debounceTimer = null;
  let currentFetchCallback = null;

  const debounceAndFetch = (cacheKey, propertyId, readings, chemical, onFetch) => {
    // Clear previous timeout
    if (debounceTimer) clearTimeout(debounceTimer);
    currentFetchCallback = onFetch;

    if (!cacheKey) {
      onFetch({ state: 'insufficient-inputs' });
      return;
    }

    // Start debounce: wait 500ms before fetching
    debounceTimer = setTimeout(() => {
      const cache = cacheRef.current;
      const inFlight = inFlightRef.current;

      // Check if we have a cached result
      if (cache.has(cacheKey)) {
        const cachedResult = cache.get(cacheKey);
        onFetch({ state: 'cached', data: cachedResult.data });
        return;
      }

      // Check if a fetch is already in flight
      if (inFlight.has(cacheKey)) {
        onFetch({ state: 'fetching' });
        inFlight
          .get(cacheKey)
          .then((result) => {
            if (currentFetchCallback === onFetch) {
              onFetch({ state: 'loaded', data: result });
            }
          })
          .catch((err) => {
            if (currentFetchCallback === onFetch) {
              onFetch({ state: 'error', error: err.message });
            }
          });
        return;
      }

      // Initiate fetch
      onFetch({ state: 'fetching' });

      const fetchPromise = fetchFn({
        propertyId,
        readings,
        chemical
      })
        .then((result) => {
          // Cache the result
          cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          });
          inFlight.delete(cacheKey);

          if (currentFetchCallback === onFetch) {
            onFetch({ state: 'loaded', data: result });
          }

          return result;
        })
        .catch((err) => {
          inFlight.delete(cacheKey);

          if (currentFetchCallback === onFetch) {
            onFetch({ state: 'error', error: err.message });
          }

          throw err;
        });

      inFlight.set(cacheKey, fetchPromise);
    }, 500);
  };

  const clearCache = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    cacheRef.current.clear();
    inFlightRef.current.clear();
  };

  return { debounceAndFetch, clearCache };
}