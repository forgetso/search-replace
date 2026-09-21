import { ChromeMock, installChromeMock } from '../testing/chromeMock'
import { LangList } from '../types'
import { beforeEach, describe, expect, test } from 'vitest'
import { injectContentScriptIntoOpenTabs, listenerInstall, pickLanguage } from './install'

const AVAILABLE: LangList[] = [
    { languageCode: 'en', languageName: 'English' },
    { languageCode: 'de', languageName: 'Deutsch' },
    { languageCode: 'ja', languageName: '日本語' },
]

let mock: ChromeMock

beforeEach(() => {
    mock = installChromeMock()
})

describe('pickLanguage', () => {
    test('uses the browser language when it is one we ship', () => {
        expect(pickLanguage(['de'], AVAILABLE)).toBe('de')
    })

    test('falls back to English for a language we do not ship', () => {
        expect(pickLanguage(['sv'], AVAILABLE)).toBe('en')
    })

    test('takes the first browser language we do ship', () => {
        expect(pickLanguage(['sv', 'ja', 'de'], AVAILABLE)).toBe('ja')
    })

    test('falls back to English when the browser reports nothing', () => {
        expect(pickLanguage([], AVAILABLE)).toBe('en')
    })

    test('falls back to English when the language list could not be loaded', () => {
        expect(pickLanguage(['de'], [])).toBe('en')
    })
})

describe('injectContentScriptIntoOpenTabs', () => {
    test('injects the content script into every open tab', async () => {
        mock.tabs.splice(
            0,
            mock.tabs.length,
            { id: 1, url: 'https://a.example/' },
            { id: 2, url: 'https://b.example/' }
        )

        const injected = await injectContentScriptIntoOpenTabs()

        expect(injected).toEqual([1, 2])
        expect(mock.executedScripts).toEqual([
            { tabId: 1, files: ['searchreplace.js'] },
            { tabId: 2, files: ['searchreplace.js'] },
        ])
    })

    test('keeps going when a restricted page refuses injection', async () => {
        // chrome://, the Web Store and other extensions' pages reject executeScript
        mock.tabs.splice(
            0,
            mock.tabs.length,
            { id: 1, url: 'https://a.example/' },
            { id: 2, url: 'https://b.example/' }
        )
        mock.blockedTabIds.add(1)

        const injected = await injectContentScriptIntoOpenTabs()

        expect(injected).toEqual([2])
    })

    test('does not reject when every tab refuses injection', async () => {
        mock.tabs.splice(0, mock.tabs.length, { id: 1, url: 'https://a.example/' })
        mock.blockedTabIds.add(1)

        await expect(injectContentScriptIntoOpenTabs()).resolves.toEqual([])
    })

    test('skips tabs that have no id', async () => {
        mock.tabs.splice(0, mock.tabs.length, { url: 'https://a.example/' }, { id: 2, url: 'https://b.example/' })

        expect(await injectContentScriptIntoOpenTabs()).toEqual([2])
    })

    test('does nothing when no tabs are open', async () => {
        mock.tabs.splice(0, mock.tabs.length)

        expect(await injectContentScriptIntoOpenTabs()).toEqual([])
        expect(mock.executedScripts).toEqual([])
    })
})

describe('listenerInstall', () => {
    /** Injection is fired and not awaited, so let its promise settle */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

    test('injects into open tabs on install, so no reload is needed', async () => {
        mock.tabs.splice(0, mock.tabs.length, { id: 7, url: 'https://a.example/' })

        listenerInstall({ reason: 'install' } as chrome.runtime.InstalledDetails)
        await settle()

        expect(mock.executedScripts).toEqual([{ tabId: 7, files: ['searchreplace.js'] }])
    })

    test('injects into open tabs on update, as the old content script is orphaned', async () => {
        mock.tabs.splice(0, mock.tabs.length, { id: 7, url: 'https://a.example/' })

        listenerInstall({ reason: 'update' } as chrome.runtime.InstalledDetails)
        await settle()

        expect(mock.executedScripts).toEqual([{ tabId: 7, files: ['searchreplace.js'] }])
    })

    test('writes default storage on install only', async () => {
        listenerInstall({ reason: 'install' } as chrome.runtime.InstalledDetails)
        await settle()
        expect(mock.local.data.storage).toBeDefined()

        mock = installChromeMock()
        listenerInstall({ reason: 'update' } as chrome.runtime.InstalledDetails)
        await settle()
        expect(mock.local.data.storage).toBeUndefined()
    })

    test('does nothing at all for a chrome update', async () => {
        listenerInstall({ reason: 'chrome_update' } as chrome.runtime.InstalledDetails)
        await settle()

        expect(mock.executedScripts).toEqual([])
        expect(mock.local.data.storage).toBeUndefined()
    })
})
