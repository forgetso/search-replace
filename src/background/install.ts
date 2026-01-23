import { LangList } from '../types'
import { getAvailableLanguages } from '../util'
import { getDefaultStorage } from './storage'

// Content scripts to inject (must match manifest.json content_scripts)
const CONTENT_SCRIPTS = ['searchreplace.js', 'options.js', 'popup.js', 'help.js', 'util.js', 'elements.js']

// Inject content scripts into existing tabs
async function injectContentScripts() {
    try {
        const tabs = await chrome.tabs.query({})
        for (const tab of tabs) {
            // Only inject into http(s) and file URLs (matching manifest.json)
            if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://') || tab.url.startsWith('file://'))) {
                try {
                    for (const script of CONTENT_SCRIPTS) {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id, allFrames: true },
                            files: [script],
                        })
                    }
                    console.debug(`BACKGROUND: Injected content scripts into tab ${tab.id}`)
                } catch (error) {
                    // Ignore errors for tabs where we can't inject (e.g., chrome:// URLs, extension pages)
                    console.debug(`BACKGROUND: Could not inject into tab ${tab.id}:`, error)
                }
            }
        }
    } catch (error) {
        console.error('BACKGROUND: Error injecting content scripts:', error)
    }
}

export function listenerInstall(details: chrome.runtime.InstalledDetails) {
    if (details.reason === 'install') {
        chrome.notifications.create('install', {
            type: 'basic',
            title: 'Search and Replace',
            iconUrl: 'assets/icon-32.png',
            message: 'Thanks for installing. You can now use Search and Replace on any open tabs!',
            priority: 2,
            buttons: [{ title: 'Ok' }],
        })
        const storage = getDefaultStorage()
        chrome.storage.local.set(storage, function () {
            console.debug('BACKGROUND: Installed')
        })

        // Get the Chrome UI language and set it as the preferred language in sync storage (default: en)
        chrome.i18n.getAcceptLanguages(function (uiLanguage) {
            getAvailableLanguages().then((langList) => {
                let initializeLang = 'en'
                if (langList && langList.length) {
                    for (const lang of langList as LangList[]) {
                        if (uiLanguage[0] === lang.languageCode) {
                            initializeLang = lang.languageCode
                        }
                    }
                }
                console.log('BACKGROUND:Fist Installation, preferredLanguage:', initializeLang)
                chrome.storage.sync.set({ preferredLanguage: initializeLang }).then((r) => {
                    console.log(r)
                })
            })
        })

        // Inject content scripts into existing tabs
        injectContentScripts()
    }

    // Also inject on update to ensure all tabs have the latest scripts
    if (details.reason === 'update') {
        injectContentScripts()
    }
}
