import { ChromeMock, installChromeMock } from '../testing/chromeMock'
import { SearchReplaceInstance, SearchReplaceResponse } from '../types'
import { beforeEach, describe, expect, test } from 'vitest'
import { listenerContentResponse, removeSearchReplaceResponses } from './content'

const INSTANCE_ID = 42

function instance(overrides: Partial<SearchReplaceInstance> = {}): SearchReplaceInstance {
    return {
        searchTerm: 'find',
        replaceTerm: 'replace',
        instanceId: INSTANCE_ID,
        options: {
            matchCase: false,
            inputFieldsOnly: false,
            hiddenContent: false,
            wholeWord: false,
            isRegex: false,
            replaceHTML: false,
            replaceAll: true,
            save: false,
        },
        ...overrides,
    }
}

function response(overrides: Partial<SearchReplaceResponse> = {}): SearchReplaceResponse {
    return {
        instance: instance(),
        inIframe: false,
        hints: [],
        location: 'https://example.com/page',
        result: { count: { original: 1, replaced: 0 }, replaced: false },
        action: 'searchReplaceResponseBackground',
        iframes: 0,
        backgroundReceived: 0,
        host: 'example.com',
        ...overrides,
    }
}

/** Messages the background forwarded to the popup */
function messagesToPopup(mock: ChromeMock): SearchReplaceResponse[] {
    return mock.sentRuntimeMessages as SearchReplaceResponse[]
}

function savedResponseKeys(mock: ChromeMock): string[] {
    return Object.keys(mock.local.data).filter((key) => key.startsWith('savedResponse-'))
}

let mock: ChromeMock

beforeEach(() => {
    mock = installChromeMock()
})

describe('listenerContentResponse', () => {
    test('forwards straight to the popup when the page has no iframes', async () => {
        await listenerContentResponse(response({ inIframe: false, iframes: 0 }))

        expect(messagesToPopup(mock)).toHaveLength(1)
        expect(messagesToPopup(mock)[0].action).toBe('searchReplaceResponseMerged')
        expect(savedResponseKeys(mock)).toEqual([])
    })

    test('holds the parent response back while iframe replies are outstanding', async () => {
        await listenerContentResponse(response({ inIframe: false, iframes: 1 }))

        expect(messagesToPopup(mock)).toHaveLength(0)
        expect(savedResponseKeys(mock)).toEqual([`savedResponse-${INSTANCE_ID}`])
    })

    test('merges the parent and iframe counts once every iframe has replied', async () => {
        await listenerContentResponse(response({ inIframe: false, iframes: 1 }))
        await listenerContentResponse(
            response({
                inIframe: true,
                iframes: 1,
                result: { count: { original: 3, replaced: 2 }, replaced: true },
            })
        )

        const merged = messagesToPopup(mock)
        expect(merged).toHaveLength(1)
        expect(merged[0].result.count).toEqual({ original: 4, replaced: 2 })
        expect(merged[0].result.replaced).toBe(true)
    })

    test('reports the parent location on the merged response', async () => {
        await listenerContentResponse(response({ inIframe: false, iframes: 1, location: 'https://example.com/parent' }))
        await listenerContentResponse(response({ inIframe: true, iframes: 1, location: 'https://cdn.example.com/f' }))

        expect(messagesToPopup(mock)[0].location).toBe('https://example.com/parent')
    })

    test('clears the saved partial response after merging, so the next search starts clean', async () => {
        await listenerContentResponse(response({ inIframe: false, iframes: 1 }))
        await listenerContentResponse(response({ inIframe: true, iframes: 1 }))

        expect(savedResponseKeys(mock)).toEqual([])
    })

    test('waits for both iframes before replying when there are two', async () => {
        await listenerContentResponse(response({ inIframe: false, iframes: 2 }))
        await listenerContentResponse(response({ inIframe: true, iframes: 2 }))

        expect(messagesToPopup(mock)).toHaveLength(0)
    })

    test('merges hints gathered from the parent and its iframes', async () => {
        const hint = { name: 'gmail', hint: 'use input fields only', domain: 'mail.google.com', selector: 'meta' }
        await listenerContentResponse(response({ inIframe: false, iframes: 1, hints: [] }))
        await listenerContentResponse(response({ inIframe: true, iframes: 1, hints: [hint] }))

        expect(messagesToPopup(mock)[0].hints?.map((h) => h.name)).toEqual(['gmail'])
    })

    test('omits hints the user has dismissed', async () => {
        const hint = { name: 'gmail', hint: 'use input fields only', domain: 'mail.google.com', selector: 'meta' }
        await mock.local.set({ storage: { hintPreferences: { gmail: true } } })

        await listenerContentResponse(response({ inIframe: false, iframes: 1, hints: [hint] }))
        await listenerContentResponse(response({ inIframe: true, iframes: 1, hints: [hint] }))

        expect(messagesToPopup(mock)[0].hints).toEqual([])
    })
})

describe('removeSearchReplaceResponses', () => {
    test('removes every saved response when given no key', async () => {
        await mock.local.set({
            'savedResponse-1': { parent: response() },
            'savedResponse-2': { parent: response() },
            storage: { keep: true },
        })

        await removeSearchReplaceResponses()

        expect(savedResponseKeys(mock)).toEqual([])
        expect(mock.local.data.storage).toEqual({ keep: true })
    })

    test('removes only the named response when given a key', async () => {
        await mock.local.set({ 'savedResponse-1': { parent: response() }, 'savedResponse-2': { parent: response() } })

        await removeSearchReplaceResponses('savedResponse-1')

        expect(savedResponseKeys(mock)).toEqual(['savedResponse-2'])
    })
})
