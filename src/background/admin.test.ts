import { ChromeMock, installChromeMock } from '../testing/chromeMock'
import {
    SavedInstances,
    SearchReplaceBackgroundMessage,
    SearchReplaceInstance,
    SearchReplacePopupStorage,
} from '../types'
import { beforeEach, describe, expect, test } from 'vitest'
import { getInstanceId } from '../util'
import { listenerAdmin, setupStorage } from './admin'

function instance(overrides: Partial<SearchReplaceInstance> = {}): SearchReplaceInstance {
    return {
        searchTerm: 'find',
        replaceTerm: 'replace',
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

function storedStorage(overrides: Partial<SearchReplacePopupStorage['storage']> = {}) {
    return {
        storage: {
            instance: instance(),
            history: [instance({ searchTerm: 'older' })],
            saved: {} as SavedInstances,
            ...overrides,
        },
    }
}

/** Captures what the background posts back down the popup's port */
function createPort() {
    const posted: unknown[] = []
    return {
        posted,
        port: { postMessage: (msg: unknown) => posted.push(msg) } as unknown as chrome.runtime.Port,
    }
}

function savedStorage(mock: ChromeMock): SearchReplacePopupStorage {
    return mock.local.data as unknown as SearchReplacePopupStorage
}

let mock: ChromeMock

beforeEach(() => {
    mock = installChromeMock()
})

describe('setupStorage', () => {
    test('prefers the instance supplied in the message over the stored one', async () => {
        await mock.local.set(storedStorage())
        const fromMessage = instance({ searchTerm: 'from message' })

        const result = await setupStorage({
            action: 'store',
            storage: { instance: fromMessage, history: [] },
        })

        expect(result.instance.searchTerm).toBe('from message')
    })

    test('falls back to the stored history when the message carries none', async () => {
        // The saved-rules page does not hold the history, so it posts an empty list
        await mock.local.set(storedStorage())

        const result = await setupStorage({
            action: 'store',
            storage: { instance: instance(), history: [] },
        })

        expect(result.history.map((h) => h.searchTerm)).toEqual(['older'])
    })

    test('uses the history from the message when it has entries', async () => {
        await mock.local.set(storedStorage())

        const result = await setupStorage({
            action: 'store',
            storage: { instance: instance(), history: [instance({ searchTerm: 'newer' })] },
        })

        expect(result.history.map((h) => h.searchTerm)).toEqual(['newer'])
    })

    test('merges hint preferences from storage and the message', async () => {
        await mock.local.set(storedStorage({ hintPreferences: { gmail: true } }))

        const result = await setupStorage({
            action: 'store',
            storage: { instance: instance(), history: [], hintPreferences: { amazon_seller: true } },
        })

        expect(result.hintPreferences).toEqual({ gmail: true, amazon_seller: true })
    })
})

describe('listenerAdmin', () => {
    test('posts the stored state back to the popup on recover', async () => {
        await mock.local.set(storedStorage())
        const { posted, port } = createPort()

        await listenerAdmin({ action: 'recover' }, port)

        expect(posted).toHaveLength(1)
        expect((posted[0] as { instance: SearchReplaceInstance }).instance.searchTerm).toBe('find')
    })

    test('does not write to storage on recover', async () => {
        await mock.local.set(storedStorage())
        const before = JSON.stringify(mock.local.data)
        const { port } = createPort()

        await listenerAdmin({ action: 'recover' }, port)

        expect(JSON.stringify(mock.local.data)).toBe(before)
    })

    test('empties the history on clearHistory but keeps the current instance', async () => {
        await mock.local.set(storedStorage())
        const { port } = createPort()

        await listenerAdmin({ action: 'clearHistory' }, port)

        expect(savedStorage(mock).storage.history).toEqual([])
        expect(savedStorage(mock).storage.instance.searchTerm).toBe('find')
    })

    test('stores the instance and history on store', async () => {
        await mock.local.set(storedStorage())
        const { port } = createPort()

        await listenerAdmin(
            {
                action: 'store',
                storage: { instance: instance({ searchTerm: 'fresh' }), history: [instance({ searchTerm: 'fresh' })] },
            },
            port
        )

        expect(savedStorage(mock).storage.instance.searchTerm).toBe('fresh')
        expect(savedStorage(mock).storage.history.map((h) => h.searchTerm)).toEqual(['fresh'])
    })

    test('saves a rule keyed by its url-sensitive instance id', async () => {
        const toSave = instance({ options: { ...instance().options, save: true } })
        await mock.local.set(storedStorage({ instance: toSave }))
        const { port } = createPort()

        const msg: SearchReplaceBackgroundMessage = {
            action: 'save',
            url: 'https://example.com/page',
            storage: { instance: toSave, history: [] },
        }
        await listenerAdmin(msg, port)

        const saved = savedStorage(mock).storage.saved ?? {}
        const ids = Object.keys(saved).map(Number)
        expect(ids).toHaveLength(1)
        expect(saved[ids[0]].url).toBe('https://example.com/page')
        // The key has to be the url-sensitive id of the rule it holds, or lookups on later page
        // loads will never find it again
        expect(ids[0]).toBe(getInstanceId(saved[ids[0]], true))
    })

    test('does not save a rule when the save option is off', async () => {
        await mock.local.set(storedStorage())
        const { port } = createPort()

        await listenerAdmin(
            { action: 'save', url: 'https://example.com/', storage: { instance: instance(), history: [] } },
            port
        )

        expect(savedStorage(mock).storage.saved ?? {}).toEqual({})
    })

    test('does not save a rule when there is no url to match on', async () => {
        const toSave = instance({ options: { ...instance().options, save: true } })
        await mock.local.set(storedStorage({ instance: toSave }))
        const { port } = createPort()

        await listenerAdmin({ action: 'save', storage: { instance: toSave, history: [] } }, port)

        expect(savedStorage(mock).storage.saved ?? {}).toEqual({})
    })

    test('replaces the previous rule when an edit changes its id', async () => {
        // Editing a saved rule must not leave the pre-edit copy behind, or it keeps being applied
        const toSave = instance({ options: { ...instance().options, save: true }, searchTerm: 'edited' })
        await mock.local.set(
            storedStorage({ instance: toSave, saved: { 1234: { ...instance(), url: 'https://example.com/' } } })
        )
        const { port } = createPort()

        await listenerAdmin(
            {
                action: 'save',
                url: 'https://example.com/',
                instanceId: 1234,
                storage: { instance: toSave, history: [] },
            },
            port
        )

        const saved = savedStorage(mock).storage.saved ?? {}
        expect(Object.keys(saved)).toHaveLength(1)
        expect(saved[Number(Object.keys(saved)[0])].searchTerm).toBe('edited')
    })

    test('deletes a saved rule by id', async () => {
        await mock.local.set(
            storedStorage({
                saved: {
                    1234: { ...instance(), url: 'https://example.com/' },
                    5678: { ...instance(), url: 'https://other.example.com/' },
                },
            })
        )
        const { port } = createPort()

        await listenerAdmin({ action: 'delete', instanceId: 1234 }, port)

        expect(Object.keys(savedStorage(mock).storage.saved ?? {})).toEqual(['5678'])
    })

    test('ignores a message with no action', async () => {
        await mock.local.set(storedStorage())
        const before = JSON.stringify(mock.local.data)
        const { posted, port } = createPort()

        await listenerAdmin({} as SearchReplaceBackgroundMessage, port)

        expect(posted).toEqual([])
        expect(JSON.stringify(mock.local.data)).toBe(before)
    })
})
