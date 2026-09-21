import { RegexFlags } from './types'
import { describe, expect, test } from 'vitest'
import { getFlags, getSearchPattern } from './regex'

describe('getFlags', () => {
    test.each([
        { matchCase: true, replaceAll: true, expected: 'g' },
        { matchCase: true, replaceAll: false, expected: '' },
        { matchCase: false, replaceAll: true, expected: 'gi' },
        { matchCase: false, replaceAll: false, expected: 'i' },
    ])('matchCase=$matchCase replaceAll=$replaceAll -> "$expected"', ({ matchCase, replaceAll, expected }) => {
        expect(getFlags(matchCase, replaceAll)).toBe(expected)
    })

    test('omits the case-insensitive flag only when the user asked to match case', () => {
        expect(getFlags(false, false)).toContain(RegexFlags.CaseInsensitive)
        expect(getFlags(true, false)).not.toContain(RegexFlags.CaseInsensitive)
    })
})

describe('getSearchPattern', () => {
    test('treats the search term literally when isRegex is false', () => {
        const pattern = getSearchPattern('a.c', false, 'g', false)
        expect('abc').not.toMatch(pattern)
        expect('a.c').toMatch(pattern)
    })

    test('escapes characters that would otherwise be regex syntax', () => {
        // The test fixtures search for "This is a test!!!"; parentheses and friends must not
        // be interpreted as groups when the user has not asked for regex
        const pattern = getSearchPattern('cost (£5) +VAT?', false, 'g', false)
        expect('the cost (£5) +VAT? today').toMatch(pattern)
    })

    test('honours the search term as a regex when isRegex is true', () => {
        const pattern = getSearchPattern('a.c', true, 'g', false)
        expect('abc').toMatch(pattern)
    })

    test('captures groups so they can be used in the replacement', () => {
        const pattern = getSearchPattern('(\\w+)@(\\w+)', true, 'g', false)
        expect('user@example'.replace(pattern, '$2:$1')).toBe('example:user')
    })

    test('wraps the term in word boundaries when wholeWord is set', () => {
        const pattern = getSearchPattern('cat', false, 'g', true)
        expect('a cat sat').toMatch(pattern)
        expect('concatenate').not.toMatch(pattern)
    })

    test('ignores wholeWord when the term is already a regex', () => {
        // wholeWord is deliberately not applied to regex terms, as the user can add \b themselves
        const pattern = getSearchPattern('cat', true, 'g', true)
        expect('concatenate').toMatch(pattern)
    })

    test('applies the requested flags', () => {
        expect(getSearchPattern('x', false, 'gi', false).flags).toBe('gi')
        expect(getSearchPattern('x', false, '', false).flags).toBe('')
    })

    test('falls back to a literal match when the term is not valid regex', () => {
        // An unclosed character class would throw in the RegExp constructor; rather than
        // failing the whole replacement we fall back to matching the term literally
        const pattern = getSearchPattern('[unclosed', true, 'g', false)
        expect('an [unclosed bracket').toMatch(pattern)
    })

    test('matches a non-breaking space when the term is written as &nbsp;', () => {
        // A page authored with &nbsp; holds U+00A0 in the DOM, so the literal entity text alone
        // would never match. See issue #1.
        const pattern = getSearchPattern('&nbsp;', false, 'g', false)
        expect('a b').toMatch(pattern)
    })

    test('still matches the literal entity text, as seen in an HTML source editor', () => {
        const pattern = getSearchPattern('&nbsp;', false, 'g', false)
        expect('a&nbsp;b').toMatch(pattern)
    })

    test('matches &nbsp; when the term is a pasted non-breaking space', () => {
        const pattern = getSearchPattern(' ', false, 'g', false)
        expect('a&nbsp;b').toMatch(pattern)
        expect('a b').toMatch(pattern)
    })

    test('accepts the entity in any case, as HTML does', () => {
        expect('a b').toMatch(getSearchPattern('&NBSP;', false, 'g', false))
    })

    test('handles the entity as part of a longer term', () => {
        const pattern = getSearchPattern('cost:&nbsp;5', false, 'g', false)
        expect('cost: 5').toMatch(pattern)
        expect('cost:&nbsp;5').toMatch(pattern)
        expect('cost: 5').not.toMatch(pattern)
    })

    test('handles a term made of several entities', () => {
        const pattern = getSearchPattern('&nbsp;&nbsp;', false, 'g', false)
        expect('a  b').toMatch(pattern)
    })

    test('covers the other invisible characters a user cannot type', () => {
        expect('a‌b').toMatch(getSearchPattern('&zwnj;', false, 'g', false))
        expect('a­b').toMatch(getSearchPattern('&shy;', false, 'g', false))
        expect('a b').toMatch(getSearchPattern('&emsp;', false, 'g', false))
    })

    test('does not extend the same treatment to &amp;, which would over-match', () => {
        // Matching a bare "&" for a search of "&amp;" would surprise rather than help
        const pattern = getSearchPattern('&amp;', false, 'g', false)
        expect('a & b').not.toMatch(pattern)
        expect('a &amp; b').toMatch(pattern)
    })

    test('leaves entity expansion out of regex mode, where the user controls the pattern', () => {
        const pattern = getSearchPattern('&nbsp;', true, 'g', false)
        expect('a b').not.toMatch(pattern)
        expect('a&nbsp;b').toMatch(pattern)
    })

    test('does not throw on any of the regex metacharacters as a literal term', () => {
        for (const term of ['[', ']', '(', ')', '{', '}', '*', '+', '?', '\\', '^', '$', '|', '.']) {
            expect(() => getSearchPattern(term, false, 'g', false)).not.toThrow()
            expect(`x${term}y`).toMatch(getSearchPattern(term, false, 'g', false))
        }
    })
})
