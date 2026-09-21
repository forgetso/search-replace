import { SearchReplaceInstance } from '../types'
import { beforeEach, describe, expect, test } from 'vitest'
import { clearHistoryClickHandler, constructSearchReplaceHistory } from './history'

function instance(searchTerm: string, replaceTerm = 'to'): SearchReplaceInstance {
    return {
        searchTerm,
        replaceTerm,
        options: {
            matchCase: false,
            inputFieldsOnly: true,
            hiddenContent: false,
            wholeWord: false,
            isRegex: false,
            replaceHTML: false,
            replaceAll: true,
            save: false,
        },
    }
}

/** Renders the history the same way popup.ts does, so the scraping is exercised for real */
function renderHistory(items: { searchTerm: string; replaceTerm: string; matchCase?: boolean }[]) {
    const list = items
        .map(
            (item) =>
                `<li data-searchTerm="${item.searchTerm}" data-replaceTerm="${item.replaceTerm}" ` +
                `data-matchCase="${String(item.matchCase ?? false)}"></li>`
        )
        .join('')
    document.body.innerHTML = `<div id="historyContent"><ul id="historyList">${list}</ul></div>`
}

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('constructSearchReplaceHistory', () => {
    test('returns an empty list when the history element is absent', () => {
        expect(constructSearchReplaceHistory()).toEqual([])
    })

    test('scrapes the existing history out of the list items', () => {
        renderHistory([
            { searchTerm: 'a', replaceTerm: 'b' },
            { searchTerm: 'c', replaceTerm: 'd' },
        ])
        expect(constructSearchReplaceHistory().map((i) => [i.searchTerm, i.replaceTerm])).toEqual([
            ['a', 'b'],
            ['c', 'd'],
        ])
    })

    test('reads the checkbox options back off the list item', () => {
        renderHistory([{ searchTerm: 'a', replaceTerm: 'b', matchCase: true }])
        const [item] = constructSearchReplaceHistory()
        expect(item.options.matchCase).toBe(true)
        expect(item.options.wholeWord).toBe(false)
    })

    test('puts the newest instance at the top', () => {
        renderHistory([{ searchTerm: 'old', replaceTerm: 'b' }])
        expect(constructSearchReplaceHistory(instance('new')).map((i) => i.searchTerm)).toEqual(['new', 'old'])
    })

    test('removes an earlier entry with the same terms rather than duplicating it', () => {
        renderHistory([
            { searchTerm: 'a', replaceTerm: 'to' },
            { searchTerm: 'b', replaceTerm: 'to' },
        ])
        expect(constructSearchReplaceHistory(instance('a')).map((i) => i.searchTerm)).toEqual(['a', 'b'])
    })

    test('treats entries as distinct when only the replace term differs', () => {
        renderHistory([{ searchTerm: 'a', replaceTerm: 'one' }])
        expect(constructSearchReplaceHistory(instance('a', 'two')).map((i) => i.replaceTerm)).toEqual(['two', 'one'])
    })

    test('caps the stored history at 10 entries', () => {
        renderHistory(Array.from({ length: 12 }, (_, i) => ({ searchTerm: `term-${i}`, replaceTerm: 'to' })))
        expect(constructSearchReplaceHistory(instance('newest'))).toHaveLength(10)
    })

    test('keeps a full 10 entries even when the list contains duplicates', () => {
        // Deduplication has to happen before the cap. If the list is trimmed to 10 first, a run
        // of duplicates eats into the limit and the user silently loses distinct entries that
        // were sitting just past the cut.
        renderHistory(
            ['a', 'a', 'a', 'a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].map((searchTerm) => ({
                searchTerm,
                replaceTerm: 'to',
            }))
        )
        const history = constructSearchReplaceHistory(instance('newest'))
        expect(history).toHaveLength(10)
        expect(history.map((i) => i.searchTerm)).toEqual(['newest', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])
    })
})

describe('clearHistoryClickHandler', () => {
    test('tells the background to clear the history and empties the rendered list', () => {
        renderHistory([{ searchTerm: 'a', replaceTerm: 'b' }])
        const posted: unknown[] = []
        const port = { postMessage: (msg: unknown) => posted.push(msg) } as unknown as chrome.runtime.Port

        clearHistoryClickHandler(port)

        expect(posted).toEqual([{ action: 'clearHistory' }])
        expect(document.getElementById('historyList')?.innerHTML).toBe('')
    })
})
