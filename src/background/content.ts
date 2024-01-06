import { SearchReplaceResponse } from '../types'
import { getAllStorageKeys } from './storage'
import { getExtensionStorage, getInstanceId, mergeSearchReplaceResults } from '../util'

async function saveSearchReplaceResponse(response: SearchReplaceResponse) {
    const id = (
        response.instance.instanceId || getInstanceId({ ...response.instance, url: response.location }, true)
    ).toString()
    const key = `savedResponse-${id}`
    await chrome.storage.local.set({ [key]: response })
    return
}

function getSearchReplaceResponse(instanceId: number): Promise<SearchReplaceResponse | undefined> {
    const key = `savedResponse-${instanceId}`
    return getExtensionStorage<SearchReplaceResponse>(key)
}

export async function removeSearchReplaceResponses() {
    const promises: Promise<void>[] = []
    const keys = await getAllStorageKeys(`savedResponse-`)
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

export async function listenerContentResponse(msg: SearchReplaceResponse) {
    msg.action = 'searchReplaceResponseMerged'
    if (!msg.inIframe && msg.iframes === 0) {
        console.log('BACKGROUND: Sending msg to popup immediately', JSON.stringify(msg, null, 4))
        await chrome.runtime.sendMessage(msg)
    } else if (msg.instance.instanceId) {
        const previousResponse = await getSearchReplaceResponse(msg.instance.instanceId)
        console.log('BACKGROUND: Got content response', JSON.stringify(msg, null, 4))
        // get the previous response whether it's an iframe or the parent, we don't care
        if (previousResponse) {
            console.log('BACKGROUND: Found previous response', JSON.stringify(previousResponse, null, 4))

            msg.result = mergeSearchReplaceResults(msg.result, previousResponse.result)
            msg.hints = Array.from(new Set([...(msg.hints || []), ...(previousResponse.hints || [])]))

            console.log('BACKGROUND: checking if mergeSearchReplaceResults is complete', msg)
            console.log(msg.backgroundReceived + previousResponse.backgroundReceived)
            console.log(msg.iframes + previousResponse.iframes)
            if (
                msg.backgroundReceived + previousResponse.backgroundReceived ===
                msg.iframes + previousResponse.iframes
            ) {
                console.log('BACKGROUND: Total frames searched = iframes count, sending msg:', msg)
                await removeSearchReplaceResponses()
                await chrome.runtime.sendMessage(msg)
            } else {
                msg.backgroundReceived += 1
                // save the response as a WIP
                console.log('BACKGROUND: Not sending response, storing as WIP', msg)
                await saveSearchReplaceResponse(msg)
            }
        } else {
            console.log('BACKGROUND: Not sending response, storing as WIP', msg)
            msg.backgroundReceived += 1

            // save the response as a WIP
            await saveSearchReplaceResponse(msg)
        }
        // send nothing to the popup
    }
}
