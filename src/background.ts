// Storing and retrieving popup values
import { SearchReplaceBackgroundMessage, SearchReplaceResponse } from './types'
import { listenerAdmin } from './background/admin'
import { listenerApplySavedInstances } from './background/saved'
import { listenerContentResponse, removeSearchReplaceResponses } from './background/content'
import { listenerInstall } from './background/install'
import { listenerTranslations } from './background/translations'

// Listen for messages from the popup and apply translations
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    listenerTranslations(msg, sender, sendResponse)
    return true
})

// Listen for messages from the popup
chrome.runtime.onConnect.addListener(function (port) {
    port.onMessage.addListener(function (msg: SearchReplaceBackgroundMessage) {
        ;(async () => {
            await listenerAdmin(msg, port)
        })()
        return true
    })
})

// Listen for messages from the content script
chrome.runtime.onMessage.addListener(function (msg: SearchReplaceResponse, sender, sendResponse) {
    console.log(
        "BACKGROUND: Received message from content script's sendResponse in listenerContentResponse",
        msg.action
    )
    if (msg.action === 'searchReplaceResponseBackground') {
        ;(async () => {
            await listenerContentResponse(msg)

            sendResponse()
        })()
    }
    if (msg.action === 'clearSavedResponses') {
        ;(async () => {
            await removeSearchReplaceResponses(`savedResponse-${msg.instance.instanceId}`)

            sendResponse()
        })()
    }
    return true
})

// Listen for the extension being installed or updated
chrome.runtime.onInstalled.addListener(function (details) {
    listenerInstall(details)
})

// Listen for tab updates and apply any saved instances
chrome.tabs.onUpdated.addListener(function (tabId, info) {
    listenerApplySavedInstances(info)
})

// Listen for storage changes
// chrome.storage.onChanged.addListener(function (changes, areaName) {
//     console.log('BACKGROUND: Storage changes', changes, areaName)
//     ;(async () => {
//         await listenerApplyStoredResponse(changes)
//     })()
//     return true
// })

// Run when popup closes
chrome.runtime.onConnect.addListener(function (externalPort) {
    externalPort.onDisconnect.addListener(function () {
        console.log('onDisconnect')
        removeSearchReplaceResponses().then(() => {
            console.log('Removed saved responses')
        })
    })
})

export {}
