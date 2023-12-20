// Storing and retrieving popup values
import {
    LangList,
    SavedInstances,
    SavedSearchReplaceInstance,
    SearchReplaceBackgroundMessage,
    SearchReplaceContentMessage,
    SearchReplaceInstance,
    SearchReplacePopupStorage,
    SearchReplaceResponse, SearchReplaceResult,
    SearchReplaceStorageItems,
} from './types'
import {getInstanceId} from './util'
import Port = chrome.runtime.Port;

function saveStorage(
    instance: SearchReplaceInstance,
    history: SearchReplaceInstance[],
    savedInstances: SavedInstances,
    port: Port
) {
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

function saveSearchReplaceResponse(
    response: SearchReplaceResponse
) {
    const id = (response.instance.instanceId || getInstanceId({...response.instance, url:response.location}, true)).toString()
    const key = `savedResponse-${id}`
    chrome.storage.local.set({[key]: JSON.stringify(response)}).then(r => console.log(r))
}

function getSearchReplaceResponse(instanceId: number): Promise<SearchReplaceResponse> {
    const key = `savedResponse-${instanceId}`
    return chrome.storage.local.get(key) as Promise<SearchReplaceResponse>

}

function mergeSearchReplaceResults(a: SearchReplaceResult, b: SearchReplaceResult): SearchReplaceResult {
    return {
        count: {
            original: a.count.original + b.count.original,
            replaced: a.count.replaced + b.count.replaced,
        },
        replaced: a.replaced || b.replaced

    }
}

async function setupStorage(msg: SearchReplaceBackgroundMessage) {
    // Get the various stored values
    const { storage } = (await chrome.storage.local.get(['storage'])) as SearchReplacePopupStorage
    console.log('BACKGROUND: saved storage is', storage)

    const instance: SearchReplaceInstance = msg.storage ? msg.storage.instance : storage.instance
    console.log('BACKGROUND: instance is: ', instance)
    // Allows the edit rules page to not have to send back history
    const history: SearchReplaceInstance[] = msg.storage
        ? msg.storage.history && msg.storage.history.length
            ? msg.storage.history
            : storage.history
        : storage.history
    console.log('BACKGROUND: history is: ', history)
    const url = msg.url
    const savedInstances: SavedInstances = storage.saved || {}
    console.log('BACKGROUND: SavedInstances is: ', savedInstances)

    return { instance, history, url, savedInstances, storage }
}

chrome.runtime.onConnect.addListener(function (port) {
    port.onMessage.addListener(async function (msg: SearchReplaceBackgroundMessage) {
        console.log('BACKGROUND: message received: ', msg)
        if (msg.action) {
            const storage = await setupStorage(msg)
            const {instance, history, url} = storage
            const savedInstances = storage.savedInstances

            if (msg.action === 'recover') {
                // Recovering search terms from the storage to display in the popup
                port.postMessage(storage as SearchReplaceStorageItems)
                // We do not want to save anything when recovering storage
                return
            } else if (msg.action === 'clearHistory') {
                // Clearing the history in the popup
                storage.history = []
                saveStorage(instance, history, savedInstances, port)
            } else if (msg.action === 'save' && instance.options.save && url) {
                // Saving a SearchReplaceInstance for use on subsequent page loads
                const instanceId = msg['instanceId']
                const newInstance: SavedSearchReplaceInstance = {...instance, url}
                const newInstanceId = getInstanceId(newInstance, true)
                savedInstances[newInstanceId] = newInstance
                if (instanceId && instanceId !== newInstanceId) {
                    delete savedInstances[instanceId]
                }
                saveStorage(instance, history, savedInstances, port)
            } else if (msg.action === 'delete') {
                // Deleting a saved SearchReplaceInstance
                const instanceId = msg['instanceId']
                if (instanceId) delete savedInstances[instanceId]
                saveStorage(instance, history, savedInstances, port)
            } else if (msg.action === 'store') {
                // Store the instance and history in the storage
                saveStorage(instance, history, savedInstances, port)
            } else if (msg.action === 'count') {
                console.log('BACKGROUND: count action received')
            }
        }
    })
    port.onMessage.addListener(async function (msg: SearchReplaceResponse) {
             if (msg.action === 'searchReplaceResponse') {
                console.log('BACKGROUND: searchReplaceResponse action received')
                if(!msg.inIframe && msg.iframes > 0) {
                    saveSearchReplaceResponse(msg)
                    await chrome.runtime.sendMessage(msg)
                } else if(msg.inIframe && msg.instance.instanceId) {
                    getSearchReplaceResponse(msg.instance.instanceId).then(previousResponse => {
                        if (previousResponse) {

                            msg.result = mergeSearchReplaceResults(msg.result, previousResponse.result)
                            msg.iframes = msg.iframes - 1
                            if (msg.iframes === 0) {
                                chrome.storage.local.remove(`savedResponse-${msg.instance.instanceId}`)

                            } else {
                                saveSearchReplaceResponse(msg)
                            }
                            chrome.runtime.sendMessage(msg)
                        }
                    })
                }

            }
        }
    )
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
                let initializeLang = 'en'
                for (const lang of langList as LangList[]) {
                    if (uiLanguage[0] === lang.languageCode) {
                        initializeLang = lang.languageCode
                    }
                }
                console.log('BACKGROUND:Fist Installation, preferredLanguage:', initializeLang)
                chrome.storage.sync.set({ preferredLanguage: initializeLang })
            })
        })
    }
})

chrome.tabs.onUpdated.addListener(async function (tabId, info) {
    console.log('BACKGROUND:In background script tab load event listener')
    if (info.status === 'complete') {
        console.log('BACKGROUND:Tab load completed')
        // Get the saved instances
        chrome.storage.local.get(['storage'], async function (result) {
            console.log('BACKGROUND:Got saved instances', JSON.stringify(result.storage.saved, null, 4))
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
                        const message: SearchReplaceContentMessage = {
                            action: 'searchReplace',
                            instance: savedInstance,
                            url: tab.url,
                        }
                        await chrome.tabs.sendMessage(tab.id, message)
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
                resolve(data)
            })
            .catch((error) => {
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
                resolve(data)
            })
            .catch((error) => {
                reject(error)
            })
    })
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'getTranslation') {
        chrome.storage.sync.get('preferredLanguage', (result) => {
            const lng = result.preferredLanguage || 'en'
            const lngFallback = 'en'

            Promise.all([loadLocalizedContent(lng), loadLocalizedContent(lngFallback)])
                .then(([data, dataFallback]) => {
                    sendResponse({ data, dataFallback })
                })
                .catch((error) => {
                    console.error('Error loading translation data:', error)
                    sendResponse(null)
                })
        })

        return true // Indicate that the response will be asynchronous
    }
    if (request.action === 'getAvailableLanguages') {
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
