import { SavedInstances, SearchReplaceContentMessage } from '../types'

export function listenerApplySavedInstances(info: chrome.tabs.TabChangeInfo) {
    console.log('SAVED:In saved script tab load event listener')
    if (info.status === 'complete') {
        console.log('SAVED:Tab load completed')
        // Get the saved instances
        chrome.storage.local.get(['storage'], async function (result) {
            console.log('SAVED:Got saved instances', JSON.stringify(result.storage.saved, null, 4))
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

                // send any matched saved instances to the content script
                // TODO modify content script to accept multiple saved instances
                if (orderedSavedInstances.length > 0) {
                    console.log(
                        'SAVED: Matched saved instances, will be applied in order of least specific to most specific',
                        orderedSavedInstances
                    )
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
}
