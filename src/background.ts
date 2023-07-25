// Storing and retrieving popup values
import {
    SavedInstances,
    SavedSearchReplaceInstance,
    SearchReplaceInstance,
    SearchReplaceMessage,
    SearchReplacePopupStorage,
} from './types'
import { getSavedInstanceId } from './util'

function getUniqueSavedInstances(
    saved: SavedSearchReplaceInstance[],
    instance: SearchReplaceInstance,
    url: string
): SavedSearchReplaceInstance[] {
    const savedInstance: SavedSearchReplaceInstance = {
        ...instance,
        url,
    }
    saved.push(savedInstance)
    console.log('saved', saved)
    // remove any duplicate objects from the saved array
    // return the array to be stored
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
    console.log('uniqueSaved: ', uniqueSaved)
    return uniqueSaved
}

chrome.runtime.onConnect.addListener(function (port) {
    port.onMessage.addListener(async function (msg) {
        const { storage } = await chrome.storage.local.get(['storage'])
        console.log('Backgroung script, msg receievd: ', msg)
        console.log('Backgroung script, storage.saved: ', storage.saved)
        if (msg['recover'] === true) {
            port.postMessage(storage)
        } else if (msg['clearHistory'] === true) {
            storage.history = []
            const searchReplaceStorage: SearchReplacePopupStorage = {
                storage,
            }
            chrome.storage.local.set(searchReplaceStorage, function () {
                port.postMessage('History cleared')
            })
        } else {
            const instance: SearchReplaceInstance = msg.instance
            const history: SearchReplaceInstance[] = msg.history || []

            const url = msg.url
            const savedInstances: { string: SavedSearchReplaceInstance } = storage.saved || {}
            if (msg['save'] && instance.options.save) {
                console.log('Saving instance')
                const instanceId = msg['instanceId']
                const newInstance = { ...instance, url }
                const newInstanceId = getSavedInstanceId(newInstance)
                savedInstances[newInstanceId] = newInstance
                console.log('new instance', JSON.stringify(newInstance, null, 4))
                // remove old instanceId
                if (instanceId && instanceId !== newInstanceId) {
                    delete savedInstances[instanceId]
                }
                console.log('savedInstances', JSON.stringify(savedInstances, null, 4))
            } else if (msg['delete']) {
                const instanceId = msg['instanceId']
                console.log('Deleting instance', instanceId)
                delete savedInstances[instanceId]
            }
            console.log(`${Object.keys(savedInstances).length} uniqueSavedInstances: ${savedInstances}`)
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
                saved: [],
            },
        }
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
