import { SearchReplaceResponse } from '../types'
import { getAllStorageKeys } from './storage'
import { getExtensionStorage, getInstanceId, mergeSearchReplaceResults } from '../util'

async function saveSearchReplaceResponse(response: SearchReplaceResponse) {
    const id = (
        response.instance.instanceId || getInstanceId({ ...response.instance, url: response.location }, true)
    ).toString()
    const key = `savedResponse-${id}`
    const r = await chrome.storage.local.set({ [key]: response })
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
    if (!msg.inIframe && (!msg.checkIframes || msg.iframes === 0)) {
        await chrome.runtime.sendMessage(msg)
    } else if (msg.instance.instanceId) {
        const previousResponse = await getSearchReplaceResponse(msg.instance.instanceId)
        // get the previous response whether its an iframe or the parent, we don't care
        if (previousResponse) {
            if (previousResponse.host === msg.host && msg.location !== previousResponse.location) {
                // Main search has already searched iframe

                const result = previousResponse.inIframe ? msg : previousResponse
                await chrome.runtime.sendMessage(result)
            } else {
                msg.result = mergeSearchReplaceResults(msg.result, previousResponse.result)
                msg.hints = [...(msg.hints || []), ...(previousResponse.hints || [])]
                msg.backgroundReceived += 1

                if (msg.backgroundReceived === msg.iframes) {
                    await removeSearchReplaceResponses()
                    await chrome.runtime.sendMessage(msg)
                } else {
                    // save the response as a WIP

                    await saveSearchReplaceResponse(msg)
                }
            }
        } else {
            msg.backgroundReceived += 1

            // save the response as a WIP
            await saveSearchReplaceResponse(msg)
        }
        // send nothing to the popup
    }
}
