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

  let url;
  try {
    url = new URL(origin);
  } catch (e) {
    throw new Error(
      `Could not derive valid origin from request headers. ` +
      `proto="${proto}", host="${host}". Error: ${e.message}`
    );
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Invalid protocol: ${url.protocol}. Must be http or https.`);
  }

  if (url.hostname === "deno.dev" || url.hostname.endsWith(".deno.dev")) {
    throw new Error(
      `Resolved origin is a deno.dev host ("${url.host}"), which must not be used for outbound links. ` +
      `Set PUBLIC_APP_URL to the app's public URL (e.g., https://preview--breez-pool-care.base44.app).`
    );
  }

  return `${url.protocol}//${url.host}`;
}