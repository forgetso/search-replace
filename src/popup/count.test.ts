import { SearchReplaceResult } from '../types'
import { describe, expect, test } from 'vitest'
import { getRemainingMatchCount } from './count'

function result(original: number, replaced: number): SearchReplaceResult {
    return { count: { original, replaced }, replaced: replaced > 0 }
}

describe('getRemainingMatchCount', () => {
    test('reports every match as remaining when nothing was replaced', () => {
        expect(getRemainingMatchCount(result(5, 0))).toBe(5)
    })

    test('subtracts the replacements that were made', () => {
        expect(getRemainingMatchCount(result(5, 2))).toBe(3)
    })

    test('reports none remaining once everything has been replaced', () => {
        expect(getRemainingMatchCount(result(5, 5))).toBe(0)
    })

    test('reports none remaining for a page with no matches', () => {
        expect(getRemainingMatchCount(result(0, 0))).toBe(0)
    })

    test('never reports a negative count', () => {
        // The reported bug: a page where more was replaced than was counted showed "-2 matches"
        expect(getRemainingMatchCount(result(1, 3))).toBe(0)
        expect(getRemainingMatchCount(result(0, 2))).toBe(0)
    })

    test('copes with counts that are not real numbers', () => {
        expect(getRemainingMatchCount(result(NaN, 1))).toBe(0)
        expect(getRemainingMatchCount(result(Infinity, Infinity))).toBe(0)
    })
})
