import { Hint, LangFile, SearchReplaceInstance, SearchReplaceResponse, SearchReplaceResult } from './types'
import {
    createTranslationProxy,
    cyrb53,
    getInstanceId,
    mergeSearchReplaceResponse,
    mergeSearchReplaceResults,
    notEmpty,
} from './util'
import { describe, expect, test } from 'vitest'

function instance(overrides: Partial<SearchReplaceInstance> = {}): SearchReplaceInstance {
    return {
        searchTerm: 'find me',
        replaceTerm: 'replaced',
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
        ...overrides,
    }
}

function result(original: number, replaced: number, wasReplaced = false): SearchReplaceResult {
    return { count: { original, replaced }, replaced: wasReplaced }
}

function response(overrides: Partial<SearchReplaceResponse> = {}): SearchReplaceResponse {
    return {
        instance: instance(),
        inIframe: false,
        hints: [],
        location: 'https://example.com/page',
        result: result(0, 0),
        action: 'searchReplaceResponse',
        iframes: 0,
        backgroundReceived: 0,
        host: 'example.com',
        ...overrides,
    }
}

function hint(name: string): Hint {
    return { name, hint: `hint for ${name}`, domain: `${name}.example.com`, selector: `.${name}` }
}

describe('cyrb53', () => {
    test('is deterministic for the same input', () => {
        expect(cyrb53('search and replace')).toBe(cyrb53('search and replace'))
    })

    test('produces different hashes for different inputs', () => {
        expect(cyrb53('a')).not.toBe(cyrb53('b'))
    })

    test('produces different hashes for the same input under different seeds', () => {
        expect(cyrb53('a', 0)).not.toBe(cyrb53('a', 1))
    })

    test('returns a safe positive integer', () => {
        const hash = cyrb53('some reasonably long search term to hash')
        expect(Number.isSafeInteger(hash)).toBe(true)
        expect(hash).toBeGreaterThanOrEqual(0)
    })

    test('handles the empty string', () => {
        expect(() => cyrb53('')).not.toThrow()
    })
})

describe('getInstanceId', () => {
    test('is stable across calls', () => {
        expect(getInstanceId(instance(), false)).toBe(getInstanceId(instance(), false))
    })

    test('changes when the search term changes', () => {
        expect(getInstanceId(instance({ searchTerm: 'one' }), false)).not.toBe(
            getInstanceId(instance({ searchTerm: 'two' }), false)
        )
    })

    test('changes when the replace term changes', () => {
        expect(getInstanceId(instance({ replaceTerm: 'one' }), false)).not.toBe(
            getInstanceId(instance({ replaceTerm: 'two' }), false)
        )
    })

    test('changes when an option changes', () => {
        const a = instance()
        const b = instance({ options: { ...instance().options, matchCase: true } })
        expect(getInstanceId(a, false)).not.toBe(getInstanceId(b, false))
    })

    test('incorporates the url only when useUrl is set', () => {
        const withUrl = instance({ url: 'https://example.com/' })
        const withOtherUrl = instance({ url: 'https://other.example.com/' })

        // Saved rules are keyed per url, so the id must vary by url when useUrl is set
        expect(getInstanceId(withUrl, true)).not.toBe(getInstanceId(withOtherUrl, true))
        // The popup's own instance id ignores the url so the same search matches across tabs
        expect(getInstanceId(withUrl, false)).toBe(getInstanceId(withOtherUrl, false))
    })

    test('ignores a missing url even when useUrl is set', () => {
        expect(getInstanceId(instance({ url: undefined }), true)).toBe(getInstanceId(instance(), false))
    })
})

describe('mergeSearchReplaceResults', () => {
    test('sums the original and replaced counts', () => {
        expect(mergeSearchReplaceResults(result(3, 1), result(4, 2))).toEqual({
            count: { original: 7, replaced: 3 },
            replaced: false,
        })
    })

    test('reports replaced if either side replaced', () => {
        expect(mergeSearchReplaceResults(result(1, 1, true), result(1, 0, false)).replaced).toBe(true)
        expect(mergeSearchReplaceResults(result(1, 0, false), result(1, 1, true)).replaced).toBe(true)
        expect(mergeSearchReplaceResults(result(1, 0, false), result(1, 0, false)).replaced).toBe(false)
    })
})

describe('mergeSearchReplaceResponse', () => {
    test('sums the counts and the background-received tally', () => {
        const merged = mergeSearchReplaceResponse(
            response({ result: result(2, 1), backgroundReceived: 1 }),
            response({ result: result(3, 0), backgroundReceived: 1 }),
            {}
        )
        expect(merged.result.count).toEqual({ original: 5, replaced: 1 })
        expect(merged.backgroundReceived).toBe(2)
    })

    test('keeps the identity of the first (parent) response', () => {
        const merged = mergeSearchReplaceResponse(
            response({ location: 'https://parent.example.com/', host: 'parent.example.com', inIframe: false }),
            response({ location: 'https://frame.example.com/', host: 'frame.example.com', inIframe: true }),
            {}
        )
        expect(merged.location).toBe('https://parent.example.com/')
        expect(merged.host).toBe('parent.example.com')
        expect(merged.inIframe).toBe(false)
    })

    test('deduplicates hints by name', () => {
        const merged = mergeSearchReplaceResponse(
            response({ hints: [hint('gmail')] }),
            response({ hints: [hint('gmail'), hint('amazon_seller')] }),
            {}
        )
        expect(merged.hints?.map((h) => h.name)).toEqual(['gmail', 'amazon_seller'])
    })

    test('drops hints the user has dismissed', () => {
        const merged = mergeSearchReplaceResponse(
            response({ hints: [hint('gmail')] }),
            response({ hints: [hint('amazon_seller')] }),
            { gmail: true }
        )
        expect(merged.hints?.map((h) => h.name)).toEqual(['amazon_seller'])
    })

    test('keeps hints whose preference is explicitly false', () => {
        const merged = mergeSearchReplaceResponse(response({ hints: [hint('gmail')] }), response(), { gmail: false })
        expect(merged.hints?.map((h) => h.name)).toEqual(['gmail'])
    })

    test('copes with responses that carry no hints', () => {
        const a = response()
        const b = response()
        delete a.hints
        delete b.hints
        expect(mergeSearchReplaceResponse(a, b, {}).hints).toEqual([])
    })
})

describe('createTranslationProxy', () => {
    const langData: LangFile = {
        data: { greeting: { message: 'Bonjour', description: '' } },
        dataFallback: {
            greeting: { message: 'Hello', description: '' },
            farewell: { message: 'Goodbye', description: '' },
        },
    }

    test('prefers the selected language', () => {
        expect(createTranslationProxy(langData)('greeting')).toBe('Bonjour')
    })

    test('falls back to the fallback language when the key is missing', () => {
        expect(createTranslationProxy(langData)('farewell')).toBe('Goodbye')
    })

    test('returns the key itself when there is no translation at all', () => {
        expect(createTranslationProxy(langData)('unknown_key')).toBe('unknown_key')
    })
})

describe('notEmpty', () => {
    test('rejects only null and undefined', () => {
        expect([1, null, 2, undefined, 3].filter(notEmpty)).toEqual([1, 2, 3])
    })

    test('keeps falsy values that are not null or undefined', () => {
        expect([0, '', false].filter(notEmpty)).toEqual([0, '', false])
    })
})
