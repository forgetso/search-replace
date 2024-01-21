import { LangList } from '../types'
import { getAvailableLanguages } from '../util'
import { getDefaultStorage } from './storage'

export function listenerInstall(details: chrome.runtime.InstalledDetails) {
    if (details.reason === 'install') {
        chrome.notifications.create('install', {
            type: 'basic',
            title: 'Search and Replace',
            iconUrl: 'assets/icon.png',
            message: 'Thanks for installing. Remember to REFRESH the page you wish to replace text on before using!',
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
    }
}
