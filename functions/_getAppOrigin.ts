/**
 * Determines the application origin for constructing email links and resources.
 * Priority: PUBLIC_APP_URL env var → request headers (x-forwarded-proto, x-forwarded-host, host) → error
 * @param {Request} req - Incoming request object
 * @returns {string} Origin string without trailing slash (e.g., "https://breezpoolcare.com")
 */
export function getAppOrigin(req) {
  const publicAppUrl = Deno.env.get("PUBLIC_APP_URL");
  
  if (publicAppUrl) {
    try {
      const u = new URL(publicAppUrl);
      if (!["http:", "https:"].includes(u.protocol)) {
        throw new Error(`Invalid protocol: ${u.protocol}. Must be http or https.`);
      }
      return `${u.protocol}//${u.host}`;
    } catch (e) {
      throw new Error(`PUBLIC_APP_URL is invalid: ${publicAppUrl}. Error: ${e.message}`);
    }
  }

  // Derive from request headers
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");

  if (!host || !host.trim()) {
    throw new Error(
      "PUBLIC_APP_URL not configured and request origin could not be derived. " +
      "Set PUBLIC_APP_URL in environment variables (e.g., https://breezpoolcare.com)."
    );
  }

  const origin = `${proto}://${host}`;

  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(`Invalid protocol: ${url.protocol}. Must be http or https.`);
    }
    return `${url.protocol}//${url.host}`;
  } catch (e) {
    throw new Error(
      `Could not derive valid origin from request headers. ` +
      `proto="${proto}", host="${host}". Error: ${e.message}`
    );
  }
}