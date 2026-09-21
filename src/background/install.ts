import { LangList } from '../types'
// Must come from ./translations, not ../util: util's version asks the background script over
// chrome.runtime.sendMessage, and a service worker does not receive its own messages, so this
// code runs *in* the background script and would never get a reply
import { getAvailableLanguages } from './translations'
import { getDefaultStorage } from './storage'

const DEFAULT_LANGUAGE = 'en'

/** The bundle listed under content_scripts in manifest.json */
const CONTENT_SCRIPT = 'searchreplace.js'

/** Kept in step with the `matches` patterns of the content script in manifest.json */
const CONTENT_SCRIPT_MATCHES = ['http://*/*', 'https://*/*', 'file:///*']

/**
 * The first browser UI language we also ship a translation for, else English.
 * Exported for tests.
 */
export function pickLanguage(uiLanguages: string[], available: LangList[]): string {
    const supported = new Set(available.map((lang) => lang.languageCode))
    return uiLanguages.find((uiLanguage) => supported.has(uiLanguage)) ?? DEFAULT_LANGUAGE
}

/**
 * Inject the content script into tabs that are already open.
 *
 * Chrome only injects content scripts into pages loaded *after* the extension is installed or
 * updated, so without this every already-open tab has to be reloaded by hand before the
 * extension will do anything there.
 *
 * Returns the ids of the tabs that were injected. Injection is expected to fail for pages the
 * extension has no access to (chrome://, the Web Store, other extensions' pages, and file:// URLs
 * unless the user has granted file access), so failures are counted and ignored rather than
 * thrown. Exported for tests.
 */
export async function injectContentScriptIntoOpenTabs(): Promise<number[]> {
    const injected: number[] = []
    let tabs: chrome.tabs.Tab[] = []
    try {
        tabs = await chrome.tabs.query({ url: CONTENT_SCRIPT_MATCHES })
    } catch (error) {
        console.error('BACKGROUND: Could not list open tabs to inject into', error)
        return injected
    }

    for (const tab of tabs) {
        if (tab.id === undefined) {
            continue
        }
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                files: [CONTENT_SCRIPT],
            })
            injected.push(tab.id)
        } catch {
            // Restricted page, or the tab was closed while we were working through the list
        }
    }
    return injected
}

export function listenerInstall(details: chrome.runtime.InstalledDetails) {
    // On update as well as install: the old content script is orphaned when the extension
    // reloads, so open tabs need the new one injecting either way
    if (details.reason === 'install' || details.reason === 'update') {
        injectContentScriptIntoOpenTabs().catch((error) =>
            console.error('BACKGROUND: Could not inject the content script into open tabs', error)
        )
    }

    if (details.reason === 'install') {
        chrome.notifications.create('install', {
            type: 'basic',
            title: 'Search and Replace',
            iconUrl: 'assets/icon-32.png',
            message:
                'Thanks for installing! If a page was already open before you installed, reload it ' +
                'to search and replace there.',
            priority: 2,
            buttons: [{ title: 'Ok' }],
        })
        const storage = getDefaultStorage()
        chrome.storage.local.set(storage)

        // Get the Chrome UI language and set it as the preferred language in sync storage (default: en)
        chrome.i18n.getAcceptLanguages(function (uiLanguages) {
            getAvailableLanguages()
                .then((langList) => chrome.storage.sync.set({ preferredLanguage: pickLanguage(uiLanguages, langList) }))
                .catch((error) => console.error('BACKGROUND: Could not detect a preferred language', error))
        })
    }
}
