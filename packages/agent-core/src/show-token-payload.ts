/**
 * Client-side read of show-token payload fields that are not secret.
 * The HMAC signature still gates acceptance at the edge; this only inspects
 * attested flags (e.g. amr) that the issuer baked into the signed payload.
 */

/**
 * Decode the JSON payload of a v1/v2 show-token (payloadB64.sig).
 * Returns null on malformed input. Does NOT verify the signature
 * (edge verifyShowToken is authoritative for security).
 */
export function readShowTokenPayload(token: string): Record<string, unknown> | null {
  if (typeof token !== "string" || token.length === 0) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0]) return null;
  try {
    const payloadB64 = parts[0];
    const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const b64 = padded + pad;
    let binary: string;
    if (typeof atob === "function") {
      binary = atob(b64);
    } else if (typeof Buffer !== "undefined") {
      binary = Buffer.from(b64, "base64").toString("binary");
    } else {
      return null;
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** True when the signed payload attests issuer opt-in for model-requested. */
export function tokenAttestsModelRequested(token: string): boolean {
  const payload = readShowTokenPayload(token);
  return payload?.amr === true;
}
