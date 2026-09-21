import { ELEMENT_FILTER } from './constants'
import { SearchReplaceActions } from './types'
import { beforeEach, describe, expect, test } from 'vitest'
import { searchReplace } from './searchreplace'

/**
 * Invariants that must hold for the reported counts, whatever the page or the options.
 *
 * The popup shows `original - replaced` as the number of remaining matches, so if `replaced`
 * ever exceeds `original` the user is told something like "-2 matches". These tests exist to
 * catch that class of bug across a matrix of page shapes and options, rather than one by one.
 */

const TERM = 'European'
const REPLACEMENT = 'American'

type Options = {
    inputFieldsOnly: boolean
    isRegex: boolean
    hiddenContent: boolean
    wholeWord: boolean
    matchCase: boolean
    replaceHTML: boolean
    replaceAll: boolean
}

function run(action: SearchReplaceActions, options: Partial<Options> = {}) {
    return searchReplace({
        action,
        window,
        searchTerm: TERM,
        replaceTerm: REPLACEMENT,
        inputFieldsOnly: false,
        isRegex: false,
        hiddenContent: false,
        wholeWord: false,
        matchCase: false,
        replaceHTML: false,
        replaceAll: true,
        isIframe: false,
        iframes: [],
        elementFilter: ELEMENT_FILTER,
        ...options,
    })
}

/** Page shapes that mix visible and hidden occurrences, which is where the counts diverge */
const PAGES: { name: string; html: string }[] = [
    { name: 'nothing to find', html: '<div><p>nothing here</p></div>' },
    { name: 'a single visible match', html: '<div><p>European</p></div>' },
    { name: 'repeated visible matches', html: '<div><p>European European European</p></div>' },
    { name: 'matches in sibling elements', html: '<div><p>European</p><p>European</p></div>' },
    { name: 'a match nested several levels deep', html: '<div><div><div><span>European</span></div></div></div>' },
    {
        name: 'one hidden sibling',
        html: '<div><p>European</p><p style="display: none;">European</p></div>',
    },
    {
        name: 'two hidden siblings',
        html: '<div><p>European</p><p style="display: none;">European</p><p style="display: none;">European</p></div>',
    },
    {
        name: 'a hidden container holding matches',
        html: '<div><p>European</p><div style="display: none;"><span><b>European</b></span></div></div>',
    },
    {
        name: 'only hidden matches',
        html: '<div style="display: none;"><p>European</p></div>',
    },
    {
        name: 'a match in an attribute as well as the text',
        html: '<div><a href="/european-news">European</a></div>',
    },
    {
        name: 'a hidden input alongside a visible one',
        html: '<div><input type="text" value="European"><input type="hidden" value="European"></div>',
    },
    {
        name: 'a match in a script, which is never searched',
        html: '<div><p>European</p><script>var x = "European"</script></div>',
    },
    {
        name: 'a site-like header with a hidden nav',
        html:
            '<header><nav style="display: none;"><a>European</a><a>European</a></nav>' +
            '<h1>European</h1></header><main><p>European news</p></main>',
    },
    {
        name: 'a contenteditable region beside hidden text',
        html: '<div contenteditable="true">European</div><div style="display: none;">European</div>',
    },
]

const OPTION_SETS: { name: string; options: Partial<Options> }[] = [
    { name: 'text', options: {} },
    { name: 'text, hidden content', options: { hiddenContent: true } },
    { name: 'text, replace next only', options: { replaceAll: false } },
    { name: 'HTML', options: { replaceHTML: true } },
    { name: 'HTML, hidden content', options: { replaceHTML: true, hiddenContent: true } },
    { name: 'HTML, replace next only', options: { replaceHTML: true, replaceAll: false } },
    { name: 'input fields only', options: { inputFieldsOnly: true } },
    { name: 'input fields only, hidden content', options: { inputFieldsOnly: true, hiddenContent: true } },
    { name: 'whole word', options: { wholeWord: true } },
    { name: 'match case', options: { matchCase: true } },
]

beforeEach(() => {
    document.body.innerHTML = ''
})

describe.each(OPTION_SETS)('$name', ({ options }) => {
    describe.each(PAGES)('$name', ({ html }) => {
        test('counting reports a sane number of matches', async () => {
            document.body.innerHTML = html
            const { count } = (await run('count', options)).searchReplaceResult

            expect(count.original).toBeGreaterThanOrEqual(0)
            expect(Number.isInteger(count.original)).toBe(true)
            // Counting must never report a replacement
            expect(count.replaced).toBe(0)
        })

        test('replacing never reports more replacements than matches', async () => {
            document.body.innerHTML = html
            const { count } = (await run('searchReplace', options)).searchReplaceResult

            expect(count.original).toBeGreaterThanOrEqual(0)
            expect(count.replaced).toBeGreaterThanOrEqual(0)
            // The popup renders `original - replaced` as the matches left on the page, so this
            // is what stops it showing "-2 matches"
            expect(count.replaced).toBeLessThanOrEqual(count.original)
        })

        test('replacing everything leaves none of the search term behind', async () => {
            document.body.innerHTML = html
            const options_ = { ...options, replaceAll: true }
            await run('searchReplace', options_)
            const after = (await run('count', options_)).searchReplaceResult

            // Whatever was counted as replaceable must actually be gone afterwards
            expect(after.count.original).toBe(0)
        })
    })
})

describe.each(OPTION_SETS)('$name', ({ options }) => {
    describe.each(PAGES)('$name', ({ html }) => {
        test('each Replace Next takes exactly one match off the count', async () => {
            // The popup shows the remaining matches, so a press that leaves the number where it
            // was reads as "I pressed it and nothing happened". Counting and replacing have to
            // agree about what is a match for this to hold.
            document.body.innerHTML = html
            const nextOnly = { ...options, replaceAll: false }
            let remaining = (await run('count', nextOnly)).searchReplaceResult.count.original

            // Bounded so a count that refuses to fall fails the expectation rather than hanging
            for (let press = 0; remaining > 0 && press < 20; press++) {
                await run('searchReplace', nextOnly)
                const now = (await run('count', nextOnly)).searchReplaceResult.count.original
                expect(now).toBe(remaining - 1)
                remaining = now
            }

            expect(remaining).toBe(0)
        })
    })
})

describe('Replace HTML counts everything it replaces', () => {
    // Replace HTML means the HTML: script and style contents and attribute values are all in
    // scope, and are all replaced. The count has to say so, or Replace Next appears to stall on
    // the matches the count never knew about.
    const MIXED =
        '<div>' +
        '<p>European</p>' +
        '<script type="application/json">{"region":"European"}</script>' +
        '<style>.European { color: red; }</style>' +
        '<a href="/European-news">link</a>' +
        '</div>'

    test('counts the match in visible text, a script, a style and an attribute', async () => {
        document.body.innerHTML = MIXED

        const { count } = (await run('count', { replaceHTML: true })).searchReplaceResult

        expect(count.original).toBe(4)
    })

    test('counts only the visible text when Replace HTML is off', async () => {
        document.body.innerHTML = MIXED

        const { count } = (await run('count', {})).searchReplaceResult

        expect(count.original).toBe(1)
    })

    test('replaces every one of them', async () => {
        document.body.innerHTML = MIXED

        await run('searchReplace', { replaceHTML: true })

        expect(document.body.innerHTML).not.toContain(TERM)
        expect((await run('count', { replaceHTML: true })).searchReplaceResult.count.original).toBe(0)
    })
})

describe('replacing leaves the rest of the page alone', () => {
    test('a match in one element does not recreate its siblings', async () => {
        // Assigning to an ancestor's innerHTML destroys and recreates every node beneath it,
        // which loses focus, selection, event listeners and the DOM identity frameworks hold on
        // to. Only the element holding the match should be touched.
        document.body.innerHTML = '<div><p id="target">European</p><p id="untouched">other text</p></div>'
        const untouched = document.getElementById('untouched')
        const untouchedText = untouched?.firstChild

        await run('searchReplace', { replaceHTML: true })

        expect(document.getElementById('untouched')).toBe(untouched)
        expect(untouched?.firstChild).toBe(untouchedText)
    })
})

describe('the count the popup displays', () => {
    test('is never negative for a page mixing visible and hidden matches', async () => {
        // The exact shape behind the "-2 matches" report: one visible match and two hidden ones,
        // searched with Replace HTML on and Hidden content off
        document.body.innerHTML =
            '<div><p>European</p><p style="display: none;">European</p>' +
            '<p style="display: none;">European</p></div>'

        const { count } = (await run('searchReplace', { replaceHTML: true })).searchReplaceResult

        expect(count.original - count.replaced).toBeGreaterThanOrEqual(0)
    })

    test('Replace HTML leaves hidden text alone unless Hidden content is set', async () => {
        // This was a known limitation for as long as replacing assigned to the innerHTML of the
        // outermost matching element: that rewrote the entire subtree, hidden descendants
        // included, so "Hidden content" had no effect in this mode. Replacing through the node
        // holding the match makes the option mean what it says.
        document.body.innerHTML =
            '<div><p id="shown">European</p><p id="gone" style="display: none;">European</p></div>'

        await run('searchReplace', { replaceHTML: true })

        expect(document.getElementById('shown')?.textContent).toBe('American')
        expect(document.getElementById('gone')?.textContent).toBe('European')
    })

    test('Replace HTML does rewrite hidden text when Hidden content is set', async () => {
        document.body.innerHTML =
            '<div><p id="shown">European</p><p id="gone" style="display: none;">European</p></div>'

        await run('searchReplace', { replaceHTML: true, hiddenContent: true })

        expect(document.getElementById('shown')?.textContent).toBe('American')
        expect(document.getElementById('gone')?.textContent).toBe('American')
    })

    test('the counts stay consistent even though hidden text is rewritten', async () => {
        // Whatever the replacement touches must also be counted, or the popup shows a negative
        document.body.innerHTML =
            '<div><p>European</p><p style="display: none;">European</p>' +
            '<p style="display: none;">European</p></div>'

        const { count } = (await run('searchReplace', { replaceHTML: true })).searchReplaceResult

        expect(count.replaced).toBe(count.original)
        expect(count.original - count.replaced).toBe(0)
    })
})
