/**
 * binanceAuth — HMAC-SHA256 signing for Binance signed REST endpoints.
 *
 * Pure browser-side. Uses the Web Crypto API. The secret never leaves
 * this module — callers pass it in, we sign, we return the signature.
 * No logging, no persistence.
 *
 * Binance signed-request shape:
 *   queryString = `param1=v1&param2=v2&timestamp={now}&recvWindow=5000`
 *   signature   = HMAC-SHA256(queryString, secretKey).hex
 *   final URL   = `${endpoint}?${queryString}&signature=${signature}`
 *   header      = X-MBX-APIKEY: <apiKey>
 *
 * Caller is responsible for wiring the result into the actual fetch call
 * with the X-MBX-APIKEY header.
 */

const enc = new TextEncoder()

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

function bufToHex(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u8.length; i++) {
    s += u8[i].toString(16).padStart(2, '0')
  }
  return s
}

/** HMAC-SHA256 hex digest of `message` keyed by `secret`. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return bufToHex(sig)
}

/**
 * Build a signed query string ready to append to a Binance REST URL.
 * Adds timestamp and recvWindow automatically; caller may pass
 * additional params via `extra`.
 */
export async function buildSignedQuery(
  secret: string,
  extra: Record<string, string | number | boolean> = {},
  recvWindowMs = 5000,
): Promise<string> {
  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(extra)) params[k] = String(v)
  params.timestamp = String(Date.now())
  params.recvWindow = String(recvWindowMs)
  const ordered = Object.keys(params).sort().map(k =>
    `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')
  const sig = await hmacSha256Hex(secret, ordered)
  return `${ordered}&signature=${sig}`
}
