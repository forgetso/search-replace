// Where the extension opens: the toolbar popup, or Chrome's side panel.
//
// The popup closes the moment anything else takes focus, which makes it awkward to work
// through a page: clicking into the page to check a replacement dismisses it, and the terms
// have to be typed again. The side panel stays open, so this is a preference rather than a
// replacement (issue #121).

import { OpenIn } from '../types'

export const OPEN_IN_KEY = 'openIn'

/** Unchanged behaviour for anyone who never visits Settings */
export const DEFAULT_OPEN_IN: OpenIn = 'popup'

const POPUP_PATH = 'assets/popup.html'

/**
 * The same document serves both surfaces, as popup.html and popup.js and style.css between
 * them are the whole UI; the query string is the only thing that tells the two apart at load
 * time. popup.ts keys its layout off it, because a side panel is as tall as the browser window
 * and the user can drag it wider, where the popup is a fixed 320px box.
 *
 * It is applied here rather than in the manifest on purpose. `side_panel.default_path` in the
 * manifest stays a plain path: a manifest Chrome rejects stops the extension loading at all,
 * and that is not a risk worth taking for a query string. setOptions runs on install, on
 * startup and whenever the preference changes, so it is always in place before the panel can be
 * opened. If it somehow were not, the panel still renders — just in the popup's narrow column.
 */
export const SIDE_PANEL_PATH = `${POPUP_PATH}?surface=sidepanel`

/**
 * `chrome.sidePanel` arrived in Chrome 114. Rather than setting `minimum_chrome_version` and
 * cutting older browsers off from updates entirely, the preference is hidden where the API is
 * missing and everything carries on as a popup.
 */
export function sidePanelAvailable(): boolean {
    return typeof chrome !== 'undefined' && chrome.sidePanel !== undefined
}

export async function getOpenIn(): Promise<OpenIn> {
    if (!sidePanelAvailable()) {
        return DEFAULT_OPEN_IN
    }
    const stored = await chrome.storage.sync.get({ [OPEN_IN_KEY]: DEFAULT_OPEN_IN })
    return stored[OPEN_IN_KEY] === 'sidePanel' ? 'sidePanel' : DEFAULT_OPEN_IN
}

/**
 * Point the toolbar button at the chosen surface.
 *
 * Clearing `default_popup` is the part that matters: while a popup is registered Chrome opens
 * it and never fires `action.onClicked`, so `openPanelOnActionClick` has nothing to act on and
 * the side panel would only ever be reachable from Chrome's own side panel menu.
 *
 * Neither setting survives a browser restart, so this runs on startup as well as on install and
 * whenever the preference changes.
 */
export async function applyOpenIn(openIn: OpenIn): Promise<void> {
    const useSidePanel = openIn === 'sidePanel' && sidePanelAvailable()

    try {
        await chrome.action.setPopup({ popup: useSidePanel ? '' : POPUP_PATH })
    } catch (error) {
        console.error('BACKGROUND: Could not set the toolbar button behaviour', error)
    }

    if (!sidePanelAvailable()) {
        return
    }

    try {
        await chrome.sidePanel.setOptions({ path: SIDE_PANEL_PATH, enabled: true })
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: useSidePanel })
    } catch (error) {
        console.error('BACKGROUND: Could not set the side panel behaviour', error)
    }
}

export async function applyStoredOpenIn(): Promise<void> {
    await applyOpenIn(await getOpenIn())
}

/**
 * Opens whichever surface is configured, for the keyboard shortcut.
 *
 * `sidePanel.open` and `action.openPopup` both require a user gesture; a command counts as one,
 * but only for as long as the handler is on the stack, so this must not be deferred behind
 * anything slow.
 */
export async function openConfiguredSurface(windowId: number | undefined): Promise<void> {
    const openIn = await getOpenIn()

    if (openIn === 'sidePanel' && sidePanelAvailable() && windowId !== undefined) {
        await chrome.sidePanel.open({ windowId })
        return
    }

    // Generally available from Chrome 127. On anything older the shortcut cannot open the popup,
    // which is no worse than before: the command had no handler at all and did nothing.
    if (typeof chrome.action.openPopup === 'function') {
        await chrome.action.openPopup()
    }
}
