// Storing and retrieving popup values
import { SearchReplaceInstance, SearchReplaceStorage, SearchReplaceStorageItems } from './types'

chrome.runtime.onConnect.addListener(function (port) {
    port.onMessage.addListener(function (msg) {
        if (msg['recover'] === true) {
            chrome.storage.local.get(['storage'], function (result) {
                const storage = result['storage'] as SearchReplaceStorageItems
                port.postMessage(storage)
            })
        } else if (msg['clearHistory'] === true) {
            chrome.storage.local.get(['storage'], function (result) {
                const storage = result['storage'] as SearchReplaceStorageItems
                storage.history = []
                const searchReplaceStorage: SearchReplaceStorage = {
                    storage,
                }
                chrome.storage.local.set(searchReplaceStorage, function () {
                    port.postMessage('History cleared')
                })
            })
        } else {
            const instance: SearchReplaceInstance = msg.instance
            const history: SearchReplaceInstance[] = msg.history || []
            const storage: SearchReplaceStorage = {
                storage: {
                    instance,
                    history,
                },
            }
            chrome.storage.local.set(storage, function () {
                port.postMessage('Terms stored')
            })
        }
    })
})

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === 'install') {
        chrome.notifications.create('install', {
            type: 'basic',
            title: 'Search and Replace',
            iconUrl: 'assets/icon.png',
            message: 'Thanks for installing. Remember to REFRESH the page you wish to replace text on before using!',
            priority: 2,
            buttons: [{ title: 'Ok' }],
        })
        const instance: SearchReplaceInstance = {
            searchTerm: '',
            replaceTerm: '',
            options: {
                matchCase: false,
                inputFieldsOnly: true,
                visibleOnly: true,
                wholeWord: false,
                isRegex: false,
            },
        }
        const storage: SearchReplaceStorage = {
            storage: {
                instance,
                history: [],
            },
        }
        chrome.storage.local.set(storage, function () {
            console.debug('Installed')
        })
    }
})

export {}
