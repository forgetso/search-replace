import { ELEMENT_FILTER } from './constants'
import { SearchReplaceActions } from './types'
import { beforeEach, describe, expect, test } from 'vitest'
import { searchReplace } from './searchreplace'

const SEARCH = 'needle'
const REPLACE = 'pin'

type Overrides = {
    searchTerm?: string
    replaceTerm?: string
    inputFieldsOnly?: boolean
    isRegex?: boolean
    hiddenContent?: boolean
    wholeWord?: boolean
    matchCase?: boolean
    replaceHTML?: boolean
    replaceAll?: boolean
}

/** Thin wrapper so that each test states only the options it cares about */
function run(action: SearchReplaceActions, overrides: Overrides = {}) {
    return searchReplace({
        action,
        window,
        searchTerm: SEARCH,
        replaceTerm: REPLACE,
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
        ...overrides,
    })
}

function counts(action: SearchReplaceActions, overrides: Overrides = {}) {
    return run(action, overrides).then((r) => r.searchReplaceResult.count)
}

function setBody(html: string) {
    document.body.innerHTML = html
}

beforeEach(() => {
    setBody('')
})

describe('counting occurrences', () => {
    test('counts nothing when the term is absent', async () => {
        setBody('<div>nothing to see</div>')
        expect(await counts('count')).toEqual({ original: 0, replaced: 0 })
    })

    test('counts a match in plain text', async () => {
        setBody('<div>a needle here</div>')
        expect((await counts('count')).original).toBe(1)
    })

    test('counts every occurrence of a repeated term', async () => {
        setBody('<div>needle needle needle</div>')
        expect((await counts('count')).original).toBe(3)
    })

    test('counts matches in inputs and textareas', async () => {
        setBody('<input type="text" value="needle"><textarea>needle</textarea>')
        expect((await counts('count', { inputFieldsOnly: true })).original).toBe(2)
    })

    test('ignores text outside inputs when inputFieldsOnly is set', async () => {
        setBody('<div>needle</div><input type="text" value="needle">')
        expect((await counts('count', { inputFieldsOnly: true })).original).toBe(1)
    })

    test('ignores script contents, which are not user-visible text', async () => {
        setBody('<script>var x = "needle"</script><div>needle</div>')
        expect((await counts('count')).original).toBe(1)
    })

    test('is case insensitive by default', async () => {
        setBody('<div>NEEDLE Needle needle</div>')
        expect((await counts('count')).original).toBe(3)
    })

    test('respects matchCase', async () => {
        setBody('<div>NEEDLE Needle needle</div>')
        expect((await counts('count', { matchCase: true })).original).toBe(1)
    })

    test('respects wholeWord', async () => {
        setBody('<div>needle needles</div>')
        expect((await counts('count', { wholeWord: true })).original).toBe(1)
    })

    test('treats the term as a regex when isRegex is set', async () => {
        setBody('<div>cat cot cut</div>')
        expect((await counts('count', { searchTerm: 'c.t', isRegex: true })).original).toBe(3)
    })

    test('treats regex metacharacters literally when isRegex is not set', async () => {
        setBody('<div>cat cot c.t</div>')
        expect((await counts('count', { searchTerm: 'c.t' })).original).toBe(1)
    })
})

describe('counting hidden content', () => {
    test('skips text hidden with display:none by default', async () => {
        setBody('<div>needle</div><div style="display: none;">needle</div>')
        expect((await counts('count')).original).toBe(1)
    })

    test('includes hidden text when hiddenContent is set', async () => {
        setBody('<div>needle</div><div style="display: none;">needle</div>')
        expect((await counts('count', { hiddenContent: true })).original).toBe(2)
    })

    test('skips text inside a hidden ancestor', async () => {
        setBody('<div style="display: none;"><div><span>needle</span></div></div>')
        expect((await counts('count')).original).toBe(0)
    })

    test('skips hidden inputs by default but finds them when asked', async () => {
        setBody('<input type="hidden" value="needle">')
        expect((await counts('count', { inputFieldsOnly: true })).original).toBe(0)
        expect((await counts('count', { inputFieldsOnly: true, hiddenContent: true })).original).toBe(1)
    })
})

describe('non-breaking spaces (issue #1)', () => {
    test('finds a non-breaking space when searching for &nbsp; in text mode', async () => {
        // The page holds U+00A0, not the six literal characters, so this used to find nothing
        setBody('<div>price:&nbsp;5</div>')
        expect((await counts('count', { searchTerm: '&nbsp;' })).original).toBe(1)
    })

    test('finds it in HTML mode too, where innerHTML shows the entity', async () => {
        setBody('<div>price:&nbsp;5</div>')
        expect((await counts('count', { searchTerm: '&nbsp;', replaceHTML: true })).original).toBe(1)
    })

    test('replaces a non-breaking space with an ordinary one', async () => {
        setBody('<div id="target">price:&nbsp;5</div>')
        await run('searchReplace', { searchTerm: '&nbsp;', replaceTerm: ' ' })

        expect(document.getElementById('target')?.textContent).toBe('price: 5')
    })

    test('removes a non-breaking space entirely', async () => {
        setBody('<div id="target">a&nbsp;&nbsp;b</div>')
        await run('searchReplace', { searchTerm: '&nbsp;', replaceTerm: '' })

        expect(document.getElementById('target')?.textContent).toBe('ab')
    })

    test('finds a non-breaking space inside an input value', async () => {
        setBody('<input id="target" type="text" value="a&nbsp;b">')
        expect((await counts('count', { searchTerm: '&nbsp;', inputFieldsOnly: true })).original).toBe(1)
    })
})

describe('counting HTML', () => {
    test('matches against the markup when replaceHTML is set', async () => {
        setBody('<div><p>needle</p></div>')
        expect((await counts('count', { searchTerm: '<p', replaceHTML: true })).original).toBe(1)
    })

    test('finds attribute values, which are invisible to a text search', async () => {
        setBody('<div><a href="https://needle.example.com/">link</a></div>')
        expect((await counts('count', { replaceHTML: true })).original).toBe(1)
        expect((await counts('count')).original).toBe(0)
    })
})

describe('replacing', () => {
    test('replaces the term in a plain element', async () => {
        setBody('<div id="target">a needle here</div>')
        const result = await run('searchReplace')

        expect(document.getElementById('target')?.textContent).toBe('a pin here')
        expect(result.searchReplaceResult.replaced).toBe(true)
    })

    test('replaces every occurrence when replaceAll is set', async () => {
        setBody('<div id="target">needle needle needle</div>')
        await run('searchReplace', { replaceAll: true })

        expect(document.getElementById('target')?.textContent).toBe('pin pin pin')
    })

    test('replaces only the first occurrence when replaceAll is not set', async () => {
        setBody('<div id="target">needle needle needle</div>')
        await run('searchReplace', { replaceAll: false })

        expect(document.getElementById('target')?.textContent).toBe('pin needle needle')
    })

    test('replaces in an input and reports the replacement', async () => {
        setBody('<input id="target" type="text" value="a needle here">')
        const result = await run('searchReplace', { inputFieldsOnly: true })

        expect((document.getElementById('target') as HTMLInputElement).value).toBe('a pin here')
        expect(result.searchReplaceResult.count.replaced).toBe(1)
    })

    test('replaces in a textarea', async () => {
        setBody('<textarea id="target">a needle here</textarea>')
        await run('searchReplace', { inputFieldsOnly: true })

        expect((document.getElementById('target') as HTMLTextAreaElement).value).toBe('a pin here')
    })

    test('fires an input event so that page frameworks notice the change', async () => {
        // React, Vue, Knockout and friends only see a value change if it is announced
        setBody('<input id="target" type="text" value="needle">')
        const events: string[] = []
        document.getElementById('target')?.addEventListener('input', () => events.push('input'))

        await run('searchReplace', { inputFieldsOnly: true })

        expect(events).toEqual(['input'])
    })

    test('leaves the page alone when counting', async () => {
        setBody('<div id="target">a needle here</div>')
        await run('count')

        expect(document.getElementById('target')?.textContent).toBe('a needle here')
    })

    test('leaves hidden text alone by default', async () => {
        setBody('<div id="shown">needle</div><div id="hidden" style="display: none;">needle</div>')
        await run('searchReplace')

        expect(document.getElementById('shown')?.textContent).toBe('pin')
        expect(document.getElementById('hidden')?.textContent).toBe('needle')
    })

    test('replaces hidden text when hiddenContent is set', async () => {
        setBody('<div id="hidden" style="display: none;">needle</div>')
        await run('searchReplace', { hiddenContent: true })

        expect(document.getElementById('hidden')?.textContent).toBe('pin')
    })

    test('supports regex capture groups in the replacement', async () => {
        setBody('<div id="target">user@example</div>')
        await run('searchReplace', { searchTerm: '(\\w+)@(\\w+)', replaceTerm: '$2 at $1', isRegex: true })

        expect(document.getElementById('target')?.textContent).toBe('example at user')
    })

    test('replaces markup when replaceHTML is set', async () => {
        setBody('<div id="target"><span>needle</span></div>')
        await run('searchReplace', { searchTerm: '<span>needle</span>', replaceTerm: '<b>pin</b>', replaceHTML: true })

        expect(document.getElementById('target')?.innerHTML).toBe('<b>pin</b>')
    })

    test('replaces text in a contenteditable element exactly once', async () => {
        // Editable elements are reachable by both the input path and the tree walk, so this
        // pins the reported count against a regression that replaces such text twice
        setBody('<div id="editor" contenteditable="true">a needle here</div>')
        const result = await run('searchReplace')

        expect(document.getElementById('editor')?.textContent).toBe('a pin here')
        expect(result.searchReplaceResult.count.replaced).toBe(1)
    })

    test('replaces text nested inside a contenteditable element exactly once', async () => {
        // Descendants of a contenteditable container are editable too, but carry no attribute
        setBody('<div id="editor" contenteditable="true"><p><span>a needle here</span></p></div>')
        const result = await run('searchReplace')

        expect(document.getElementById('editor')?.textContent).toBe('a pin here')
        expect(result.searchReplaceResult.count.replaced).toBe(1)
    })

    test('does not touch script contents', async () => {
        setBody('<script id="s">var x = "needle"</script><div>needle</div>')
        await run('searchReplace')

        expect(document.getElementById('s')?.textContent).toContain('needle')
    })

    test('replaces in the srcdoc of an editor iframe', async () => {
        // The block editor renders its canvas into a srcdoc iframe, which is why srcdoc is
        // searched at all — see the editor names and classes in RICH_TEXT_EDITORS
        setBody('<iframe id="frame" name="editor-canvas" srcdoc="<p>a needle here</p>"></iframe>')
        const result = await run('searchReplace')

        expect((document.getElementById('frame') as HTMLIFrameElement).srcdoc).toContain('pin')
        expect(result.searchReplaceResult.count.replaced).toBeGreaterThan(0)
    })

    test('does not reach the srcdoc of an ordinary iframe', async () => {
        // Only blob and editor iframes are searched, so a plain srcdoc iframe is skipped.
        // Broadening this is tracked upstream as issue #114.
        setBody('<iframe id="frame" srcdoc="<p>a needle here</p>"></iframe>')
        await run('searchReplace')

        expect((document.getElementById('frame') as HTMLIFrameElement).srcdoc).toContain('needle')
    })
})

describe('reported counts', () => {
    test('reports every occurrence as replaced after a global replace', async () => {
        setBody('<div>needle needle</div>')
        const { count } = (await run('searchReplace', { replaceAll: true })).searchReplaceResult

        // The popup shows `original - replaced` as the number of remaining matches
        expect(count.original - count.replaced).toBe(0)
    })

    test('reports one replacement and the rest remaining after a single replace', async () => {
        setBody('<div>needle needle needle</div>')
        const { count } = (await run('searchReplace', { replaceAll: false })).searchReplaceResult

        expect(count.replaced).toBe(1)
        expect(count.original - count.replaced).toBe(2)
    })

    test('reports nothing replaced when the term is absent', async () => {
        setBody('<div>nothing here</div>')
        const { count, replaced } = (await run('searchReplace')).searchReplaceResult

        expect(count).toEqual({ original: 0, replaced: 0 })
        expect(replaced).toBe(false)
    })
})
