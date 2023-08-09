// Storing and retrieving popup values
import {
    SavedInstances,
    SearchReplaceInstance,
    SearchReplaceMessage,
    SearchReplacePopupStorage,
    SearchReplaceStorageItems,
    SearchReplaceStorageMessage,
} from './types'
import { getSavedInstanceId } from './util'

function clearHistory(storage: SearchReplaceStorageItems, port: chrome.runtime.Port) {
    storage.history = []
    const searchReplaceStorage: SearchReplacePopupStorage = {
        storage,
    }
    chrome.storage.local.set(searchReplaceStorage, function () {
        port.postMessage('History cleared')
    })
}

function saveStorage(instance, history, savedInstances, port) {
    // always store the instance and history
    const newStorage: SearchReplacePopupStorage = {
        storage: {
            instance,
            history,
            saved: savedInstances,
        },
    }
    chrome.storage.local.set(newStorage, function () {
        port.postMessage('Terms stored')
    })
}

function getNewSavedInstances(
    msg: SearchReplaceStorageMessage,
    instance: SearchReplaceInstance,
    savedInstances: SavedInstances,
    url: string
) {
    if (msg.actions.save && instance.options.save) {
        const instanceId = msg['instanceId']
        const newInstance = { ...instance, url }
        const newInstanceId = getSavedInstanceId(newInstance)
        savedInstances[newInstanceId] = newInstance
        if (instanceId && instanceId !== newInstanceId) {
            delete savedInstances[instanceId]
        }
    } else if (msg.actions.delete) {
        const instanceId = msg['instanceId']
        delete savedInstances[instanceId]
    }
    return savedInstances
}

chrome.runtime.onConnect.addListener(function (port) {
    port.onMessage.addListener(async function (msg: SearchReplaceStorageMessage) {
        // Get the various stored values
        const { storage } =
            ((await chrome.storage.local.get(['storage'])) as SearchReplacePopupStorage) || getDefaultStorage()
        const instance: SearchReplaceInstance = msg.storage ? msg.storage.instance : storage.instance
        // Allows the edit rules page to not have to send back history
        const history: SearchReplaceInstance[] = msg.storage
            ? msg.storage.history && msg.storage.history.length
                ? msg.storage.history
                : storage.history
            : storage.history
        console.log('Background script, history is: ', history)
        const url = msg.url
        let savedInstances: SavedInstances = storage.saved || {}
        console.log('Backgroung script, msg receieved: ', msg)
        if (msg.actions.recover) {
            port.postMessage(storage as SearchReplaceStorageItems)
            // We do not want to save anything when recovering storage
            return
        } else if (msg.actions.clearHistory) {
            clearHistory(storage, port)
        } else {
            if (url) {
                savedInstances = getNewSavedInstances(msg, instance, savedInstances, url)
            }
            saveStorage(instance, history, savedInstances, port)
        }
    })
})

function getDefaultStorage(): SearchReplacePopupStorage {
    const instance: SearchReplaceInstance = {
        searchTerm: '',
        replaceTerm: '',
        options: {
            matchCase: false,
            inputFieldsOnly: true,
            visibleOnly: true,
            wholeWord: false,
            isRegex: false,
            replaceAll: true,
            save: false,
        },
    }
    const saved: SavedInstances = {}
    const history: SearchReplaceInstance[] = []
    return {
        storage: {
            instance,
            history,
            saved,
        },
    }
}

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
        const storage = getDefaultStorage()
        chrome.storage.local.set(storage, function () {
            console.debug('Installed')
        })
    }
})

chrome.tabs.onUpdated.addListener(async function (tabId, info) {
    console.log('In background script tab load event listener')
    if (info.status === 'complete') {
        console.log('Tab load completed')
        // Get the saved instances
        chrome.storage.local.get(['storage'], async function (result) {
            console.log('Got saved instances', JSON.stringify(result.storage.saved, null, 4))
            //Send the saved instances to the content script
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
            if (tab && tab.id) {
                // check if the tab url matches any saved instances
                const saved: SavedInstances = result.storage.saved || {}
                const savedInstances = Object.values(saved).filter((savedInstance) => {
                    try {
                        const matcher = new RegExp(savedInstance.url)
                        return matcher.test(tab.url || '')
                    } catch {
                        return savedInstance.url === tab.url
                    }
                })
                // order the saved instances by length of the URL pattern, longest first, so that the most specific rules are applied first
                // TODO - this is a bit of a hack, ideally we would use a trie or something to match the most specific rule first
                const orderedSavedInstances = savedInstances.sort((a, b) => {
                    return b.url.length - a.url.length
                })
                console.log(
                    'Matched saved instances, will be applied in order of least specific to most specific',
                    orderedSavedInstances
                )
                // send any matched saved instances to the content script
                // TODO modify content script to accept multiple saved instances
                if (orderedSavedInstances.length > 0) {
                    for (const savedInstance of orderedSavedInstances) {
                        const message: SearchReplaceMessage = {
                            action: 'searchReplace',
                            instance: savedInstance,
                            history: [],
                            url: tab.url,
                        }
                        chrome.tabs.sendMessage(tab.id, message)
                    }
                }
            }
        })
    }
})
export {}
