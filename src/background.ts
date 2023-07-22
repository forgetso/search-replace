// Storing and retrieving popup values
import {
    SavedSearchReplaceInstance,
    SearchReplaceInstance,
    SearchReplaceMessage,
    SearchReplacePopupStorage,
    SearchReplaceSavedInstancesStorage,
    SearchReplaceStorageItems,
} from './types'
import { tabConnect } from './popup'

function saveInstance(instance: SearchReplaceInstance, url: string) {
    chrome.storage.local.get(['saved'], function (result) {
        console.log('saving instance with url: ', url)
        const saved = (result['saved'] as SavedSearchReplaceInstance[]) || []
        const savedInstance: SavedSearchReplaceInstance = {
            ...instance,
            url,
        }
        saved.push(savedInstance)

        // remove any duplicate objects from the saved array
        const uniqueSaved = saved.filter(
            (savedInstance, index, self) =>
                index ===
                self.findIndex(
                    (t) =>
                        t.url === savedInstance.url &&
                        t.searchTerm === savedInstance.searchTerm &&
                        t.replaceTerm === savedInstance.replaceTerm &&
                        t.options.matchCase === savedInstance.options.matchCase &&
                        t.options.inputFieldsOnly === savedInstance.options.inputFieldsOnly &&
                        t.options.visibleOnly === savedInstance.options.visibleOnly &&
                        t.options.wholeWord === savedInstance.options.wholeWord &&
                        t.options.isRegex === savedInstance.options.isRegex
                )
        )

        // store the unique saved array
        const searchReplaceSavedInstancesStorage: SearchReplaceSavedInstancesStorage = {
            saved: uniqueSaved,
        }

        chrome.storage.local.set(searchReplaceSavedInstancesStorage, function () {
            console.debug('Saved')
        })
    })
}

chrome.runtime.onConnect.addListener(function (port) {
    port.onMessage.addListener(function (msg) {
        console.log('Backgroung script, msg receievd: ', msg)
        if (msg['recover'] === true) {
            chrome.storage.local.get(['storage'], function (result) {
                const storage = result['storage'] as SearchReplaceStorageItems
                port.postMessage(storage)
            })
        } else if (msg['clearHistory'] === true) {
            chrome.storage.local.get(['storage'], function (result) {
                const storage = result['storage'] as SearchReplaceStorageItems
                storage.history = []
                const searchReplaceStorage: SearchReplacePopupStorage = {
                    storage,
                }
                chrome.storage.local.set(searchReplaceStorage, function () {
                    port.postMessage('History cleared')
                })
            })
        } else {
            const instance: SearchReplaceInstance = msg.instance
            const history: SearchReplaceInstance[] = msg.history || []
            const url = msg.url
            if (instance.options.save) {
                saveInstance(instance, url)
            }
            const storage: SearchReplacePopupStorage = {
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
                replaceAll: false,
                save: false,
            },
        }
        const storage: SearchReplacePopupStorage = {
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

chrome.tabs.onUpdated.addListener(async function (tabId, info) {
    console.log('in background script tab load event listener')
    if (info.status === 'complete') {
        console.log('tab load completed')
        // Get the saved instances
        chrome.storage.local.get(['saved'], async function (result) {
            console.log('got saved instances', result)
            //Send the saved instances to the content script
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
            if (tab && tab.id) {
                console.log('sending tab query message')
                // check if the tab url matches any saved instances
                const saved = (result['saved'] as SavedSearchReplaceInstance[]) || []
                const savedInstances = saved.filter((savedInstance) => savedInstance.url === tab.url)
                console.log('matched saved instances', savedInstances)
                // send any matched saved instances to the content script
                if (savedInstances.length > 0) {
                    const message: SearchReplaceMessage = {
                        action: 'searchReplace',
                        instance: savedInstances[0],
                        history: [],
                        url: tab.url,
                    }
                    chrome.tabs.sendMessage(tab.id, message)
                }
            }
        })
    }
})
export {}
