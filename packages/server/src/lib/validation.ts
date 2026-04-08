/**
 * Tiny validation helpers used by route handlers.
 *
 * Hand-rolled instead of pulling in zod — the surface area is small enough
 * that zod's dependency weight doesn't earn its keep yet. Each helper either
 * returns the parsed value or `null`, letting routes branch on the result
 * with one line of code.
 */

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/

/**
 * Parse a string-or-undefined as a positive integer with default + max clamp.
 * Returns the clamped integer, or `defaultValue` if input is missing/invalid.
 */
export function parsePositiveInt(
  raw: string | undefined,
  defaultValue: number,
  max: number,
): number {
  if (raw === undefined || raw === '') return defaultValue
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return defaultValue
  return Math.min(n, max)
}

/** Parse a unix-second timestamp. Returns null if invalid. */
export function parseUnixTimestamp(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** Returns the lowercase address if it matches the EVM 0x[40 hex] pattern. */
export function parseAddress(raw: string | undefined): `0x${string}` | null {
  if (!raw) return null
  if (!ADDRESS_PATTERN.test(raw)) return null
  return raw.toLowerCase() as `0x${string}`
}

/** Returns the value if it's one of `allowed`, otherwise `null`. */
export function parseEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | null {
  if (raw === undefined) return null
  return allowed.includes(raw as T) ? (raw as T) : null
}

/**
 * Standard error response. Uses the same envelope as successful responses
 * (`{ success: false, error: ... }`) so the frontend has one shape to handle.
 */
export function badRequest(message: string): { success: false; error: string } {
  return { success: false, error: message }
}
