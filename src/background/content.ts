import { HintPreferences, SearchReplaceResponse, SearchReplaceStorageItems } from '../types'
import { getAllStorageKeys } from './storage'
import { getExtensionStorage, getInstanceId, mergeSearchReplaceResponse } from '../util'

type SavedSearchReplaceResponseStorage = {
    [key: string]: SavedSearchReplaceResponse
}

type SavedSearchReplaceResponse = {
    parent?: SearchReplaceResponse
    iframes?: SearchReplaceResponse[]
}

async function saveSearchReplaceResponse(response: SearchReplaceResponse) {
    const id = (
        response.instance.instanceId || getInstanceId({ ...response.instance, url: response.location }, true)
    ).toString()
    const key = `savedResponse-${id}`
    const savedResponse = await getSearchReplaceResponse(Number(id))
    console.log(`Saved response for ${id}?:`, JSON.stringify(savedResponse, null, 4))
    if (!response.inIframe) {
        const storage: SavedSearchReplaceResponseStorage =
            savedResponse && savedResponse.iframes
                ? { [key]: { parent: response, iframes: savedResponse.iframes } }
                : { [key]: { parent: response } }
        await chrome.storage.local.set(storage)
    } else {
        const storage =
            savedResponse && savedResponse.parent
                ? { [key]: { parent: savedResponse.parent, iframes: [response] } }
                : { [key]: { iframes: [response] } }

        await chrome.storage.local.set(storage)
    }
    return
}

function getSearchReplaceResponse(instanceId: number): Promise<SavedSearchReplaceResponse | undefined> {
    const key = `savedResponse-${instanceId}`
    return getExtensionStorage<SavedSearchReplaceResponse>(key)
}

export async function removeSearchReplaceResponses(key?: string) {
    const promises: Promise<void>[] = []
    const keys = key ? [key] : await getAllStorageKeys(`savedResponse-`)
    // loop local storage keys and remove any saved responses, as there should only be one stored
    // at any time
    for (const key of keys) {
        promises.push(chrome.storage.local.remove(key))
    }
    try {
        await Promise.all(promises)
        return
    } catch (e) {
        return console.error('BACKGROUND: Failed to remove saved responses', e)
    }
}

async function checkPreviousResponse(msg: SearchReplaceResponse) {
    if (msg.instance.instanceId) {
        const previousResponse = await getSearchReplaceResponse(msg.instance.instanceId)
        console.log('BACKGROUND: Got content response', JSON.stringify(msg, null, 4))
        // get the previous response that will contain either the parent and / or the iframe responses
        if (previousResponse) {
            // assume the current msg is not in an iframe and the previousResponse contains the iframe responses
            let iframeResults = previousResponse.iframes
            let mergedResult = msg

            // otherwise if the current msg is in an iframe and the previousResponse contains the parent response then
            // take the parent and any saveed iframe responses and combine with the current iframe msg
            if (msg.inIframe) {
                if (previousResponse.parent) {
                    iframeResults = previousResponse.iframes
                        ? Array.from(new Set([...previousResponse.iframes, msg]))
                        : [msg]
                    mergedResult = previousResponse.parent
                }
            }

            // merge the responses if there are iframeResults
            if (iframeResults) {
                const hintPreferences: HintPreferences =
                    (await getExtensionStorage<SearchReplaceStorageItems>('storage'))?.hintPreferences || {}
                for (const iframeResult of iframeResults) {
                    mergedResult = mergeSearchReplaceResponse(mergedResult, iframeResult, hintPreferences)
                }
                // if the total number in msg.backGroundReceived is equal to the number of iframes then we're good,
                // send the response to the popup.
                if (mergedResult.backgroundReceived === mergedResult.iframes) {
                    console.log('Sending merged result to popup', JSON.stringify(mergedResult, null, 4))
                    await chrome.runtime.sendMessage(mergedResult)
                    await removeSearchReplaceResponses(`savedResponse-${msg.instance.instanceId}`)
                }
            }
        }
    }
}

export async function listenerContentResponse(msg: SearchReplaceResponse) {
    msg.action = 'searchReplaceResponseMerged'
    // console.log('BACKGROUND: Received msg from content', JSON.stringify(msg, null, 4))
    if (!msg.inIframe && msg.iframes === 0) {
        console.log('BACKGROUND: Sending msg to popup immediately', JSON.stringify(msg, null, 4))
        await chrome.runtime.sendMessage(msg)
    } else if (!msg.inIframe && msg.iframes > 0) {
        console.log('Storing parent response', JSON.stringify(msg, null, 4))
        // save the response as a WIP
        await saveSearchReplaceResponse(msg) // --> triggers storage change listener
    } else if (msg.inIframe) {
        // note that we've received a response from the iframe
        msg.backgroundReceived = msg.backgroundReceived += 1
        console.log('Storing iframe response', JSON.stringify(msg, null, 4))
        // save the response as a WIP
        await saveSearchReplaceResponse(msg) // --> triggers storage change listener
    }

    checkPreviousResponse(msg).then(() => {
        console.log('BACKGROUND: checkPreviousResponse complete')
    })
}
