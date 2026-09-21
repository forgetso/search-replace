import { CONTENT_SCRIPT_FILE, NO_RECEIVER_MESSAGE } from '../constants'
import { SearchReplaceContentMessage } from '../types'

/** Whether a rejection from `tabs.sendMessage` means no content script was listening */
export function isMissingContentScript(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes(NO_RECEIVER_MESSAGE)
}

export type DeliveryResult = 'delivered' | 'delivered-after-injecting' | 'no-content-script'

/**
 * Send a message to the content script, injecting it first if it is not there.
 *
 * Chrome only injects content scripts into pages loaded *after* the extension is installed,
 * updated or reloaded. Because Chrome updates extensions silently in the background, a
 * long-lived tab — a dashboard someone leaves open for days — loses its content script without
 * anything visibly happening. Every later `tabs.sendMessage` then rejects with "Receiving end
 * does not exist", the popup does nothing at all, and the rejection surfaces as an uncaught
 * error. That is the failure reported in issue #126 on Meta Ads Manager, and it explains a
 * report of "it worked in the past, and a year ago it stopped".
 *
 * Rather than asking the user to reload, inject the content script and try again.
 */
export async function deliverToContentScript(
    tabId: number,
    message: SearchReplaceContentMessage
): Promise<DeliveryResult> {
    try {
        await chrome.tabs.sendMessage(tabId, message)
        return 'delivered'
    } catch (error) {
        if (!isMissingContentScript(error)) {
            throw error
        }
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: [CONTENT_SCRIPT_FILE],
        })
    } catch {
        // A page the extension has no access to: chrome://, the Web Store, a PDF viewer, or a
        // file:// URL without file access granted
        return 'no-content-script'
    }

    try {
        await chrome.tabs.sendMessage(tabId, message)
        return 'delivered-after-injecting'
    } catch {
        return 'no-content-script'
    }
}
