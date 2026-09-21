import { SavedInstances, SavedSearchReplaceInstance, SearchReplaceContentMessage } from '../types'

/**
 * Saved rules whose url pattern matches this tab, most specific first.
 *
 * The pattern is treated as a regular expression, falling back to an exact match when it is not
 * valid regex. Ordering by pattern length is a stand-in for real specificity ranking.
 * Exported for tests.
 */
export function matchSavedInstances(saved: SavedInstances, url: string): SavedSearchReplaceInstance[] {
    return Object.values(saved)
        .filter((savedInstance) => {
            try {
                return new RegExp(savedInstance.url).test(url)
            } catch {
                return savedInstance.url === url
            }
        })
        .sort((a, b) => b.url.length - a.url.length)
}

export function listenerApplySavedInstances(info: chrome.tabs.TabChangeInfo) {
    if (info.status !== 'complete') {
        return
    }
    // Get the saved instances
    chrome.storage.local.get(['storage'], async function (result) {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
        if (!tab || !tab.id) {
            return
        }
        // `storage` is absent until the popup has been opened at least once, so it cannot be
        // dereferenced directly
        const saved: SavedInstances = result.storage?.saved || {}
        const matched = matchSavedInstances(saved, tab.url || '')

        // send any matched saved instances to the content script
        // TODO modify content script to accept multiple saved instances
        for (const savedInstance of matched) {
            const message: SearchReplaceContentMessage = {
                action: 'searchReplace',
                instance: savedInstance,
                url: tab.url,
            }
            await chrome.tabs.sendMessage(tab.id, message)
        }
    })
}
