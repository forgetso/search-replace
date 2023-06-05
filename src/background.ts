// Storing and retrieving popup values
import { SearchReplaceInstance, SearchReplaceStorage, SearchReplaceStorageItems } from './types'

chrome.runtime.onConnect.addListener(function (port) {
    port.onMessage.addListener(function (msg) {
        if (msg['recover'] === true) {
            chrome.storage.local.get(['storage'], function (result) {
                const storage = result['storage'] as SearchReplaceStorage
                port.postMessage(storage)
            })
        } else if (msg['clearHistory'] === true) {
            chrome.storage.local.get(['storage'], function (result) {
                const storage = result['storage'] as SearchReplaceStorage
                storage.storage.history = []
                chrome.storage.local.set(storage, function () {
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
    }
})

export {}
