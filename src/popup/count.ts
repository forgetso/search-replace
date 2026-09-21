import { SearchReplaceResult } from '../types'

/**
 * How many matches are left on the page after a search or a replacement.
 *
 * Clamped at zero on purpose. Counting and replacing walk the DOM by different routes and with
 * different filters, so if they ever disagree again the user should not be shown something
 * impossible like "-2 matches". The invariant itself is covered by
 * searchreplace.invariants.test.ts; this is the last line of defence in front of the user.
 */
export function getRemainingMatchCount(result: SearchReplaceResult): number {
    const remaining = result.count.original - result.count.replaced
    return Number.isFinite(remaining) ? Math.max(0, remaining) : 0
}
