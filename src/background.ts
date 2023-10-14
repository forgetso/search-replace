// Storing and retrieving popup values
import {
    LangList,
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

        // Get the Chrome UI language and set it as the preferred language in sync storage (default: en)
        chrome.i18n.getAcceptLanguages(function (uiLanguage) {
            getAvailableLanguages().then((langList) => {
                let initializeLang
                initializeLang = 'en'
                for (const lang of langList as LangList[]) {
                    if (uiLanguage[0] === lang.languageCode) {
                        initializeLang = lang.languageCode
                    }
                }
                console.log('Fist Installation, preferredLanguage:', initializeLang)
                chrome.storage.sync.set({ preferredLanguage: initializeLang })
            })
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

function getAvailableLanguages() {
    return new Promise((resolve, reject) => {
        const localePath = '_locales/list.json'

        // Load the langlist content
        fetch(chrome.runtime.getURL(localePath))
            .then((response) => response.json())
            .then((data) => {
                console.log(data)
                resolve(data)
            })
            .catch((error) => {
                console.log(error)
                reject(error)
            })
    })
}

function loadLocalizedContent(lng: string) {
    return new Promise((resolve, reject) => {
        const localePath = '_locales/' + lng + '/messages.json'

        // Load the localized content
        fetch(chrome.runtime.getURL(localePath))
            .then((response) => response.json())
            .then((data) => {
                console.log(data)
                resolve(data)
            })
            .catch((error) => {
                console.log(error)
                reject(error)
            })
    })
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'getTranslation') {
        chrome.storage.sync.get('preferredLanguage', (result) => {
            const lng = result.preferredLanguage || 'en'

            loadLocalizedContent(lng)
                .then((data) => {
                    console.log('data,', data)
                    sendResponse(data)
                })
                .catch((error) => {
                    console.error('Error loading translation data:', error)
                    sendResponse(null) // You can send back an error response
                })
        })

        return true // Indicate that the response will be asynchronous
    } else if (request.action === 'getAvailableLanguages') {
        getAvailableLanguages()
            .then((availableLanguages) => {
                sendResponse(availableLanguages)
            })
            .catch((error) => {
                console.error('Error loading _locales folder:', error)
                sendResponse(null)
            })
        return true // Indicate that the response will be asynchronous
    }
})

export {}
