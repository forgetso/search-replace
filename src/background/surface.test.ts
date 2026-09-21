import { ChromeMock, installChromeMock } from '../testing/chromeMock'
import {
    DEFAULT_OPEN_IN,
    OPEN_IN_KEY,
    SIDE_PANEL_PATH,
    applyOpenIn,
    applyStoredOpenIn,
    getOpenIn,
    openConfiguredSurface,
    sidePanelAvailable,
} from './surface'
import { beforeEach, describe, expect, test } from 'vitest'

let mock: ChromeMock

beforeEach(() => {
    mock = installChromeMock()
})

/** Chrome 113 and older, where chrome.sidePanel does not exist */
function withoutSidePanel() {
    delete (mock.chrome as { sidePanel?: unknown }).sidePanel
}

describe('getOpenIn', () => {
    test('defaults to the popup, so an existing install behaves as it always has', async () => {
        expect(await getOpenIn()).toBe('popup')
        expect(DEFAULT_OPEN_IN).toBe('popup')
    })

    test('returns the stored preference', async () => {
        mock.sync.data[OPEN_IN_KEY] = 'sidePanel'

        expect(await getOpenIn()).toBe('sidePanel')
    })

    test('ignores a value that is neither surface', async () => {
        mock.sync.data[OPEN_IN_KEY] = 'somewhere-else'

        expect(await getOpenIn()).toBe('popup')
    })

    test('stays on the popup where there is no side panel API to use', async () => {
        mock.sync.data[OPEN_IN_KEY] = 'sidePanel'
        withoutSidePanel()

        expect(await getOpenIn()).toBe('popup')
    })
})

describe('applyOpenIn', () => {
    test('registers the popup so the toolbar button opens it', async () => {
        await applyOpenIn('popup')

        expect(mock.surface.setPopup).toEqual(['assets/popup.html'])
        expect(mock.surface.panelBehaviour).toEqual([false])
    })

    test('clears the popup so the toolbar button reaches the side panel', async () => {
        // While a popup is registered Chrome opens it and never fires action.onClicked, so
        // openPanelOnActionClick would have nothing to act on
        await applyOpenIn('sidePanel')

        expect(mock.surface.setPopup).toEqual([''])
        expect(mock.surface.panelBehaviour).toEqual([true])
    })

    test('points the side panel at the shared popup document', async () => {
        await applyOpenIn('sidePanel')

        expect(mock.surface.panelOptions).toEqual([{ path: SIDE_PANEL_PATH, enabled: true }])
        expect(SIDE_PANEL_PATH.startsWith('assets/popup.html')).toBe(true)
    })

    test('keeps the popup registered when asked for a side panel Chrome cannot show', async () => {
        withoutSidePanel()

        await applyOpenIn('sidePanel')

        expect(mock.surface.setPopup).toEqual(['assets/popup.html'])
    })

    test('does not throw when the browser refuses the call', async () => {
        mock.chrome.action.setPopup = () => Promise.reject(new Error('nope'))

        await expect(applyOpenIn('popup')).resolves.toBeUndefined()
    })
})

describe('applyStoredOpenIn', () => {
    test('applies whatever is in storage', async () => {
        mock.sync.data[OPEN_IN_KEY] = 'sidePanel'

        await applyStoredOpenIn()

        expect(mock.surface.setPopup).toEqual([''])
    })
})

describe('openConfiguredSurface', () => {
    test('opens the side panel in the window the shortcut was used in', async () => {
        mock.sync.data[OPEN_IN_KEY] = 'sidePanel'

        await openConfiguredSurface(12)

        expect(mock.surface.opened).toEqual([12])
        expect(mock.surface.openPopupCalls).toBe(0)
    })

    test('opens the popup when that is the chosen surface', async () => {
        await openConfiguredSurface(12)

        expect(mock.surface.openPopupCalls).toBe(1)
        expect(mock.surface.opened).toEqual([])
    })

    test('falls back to the popup when there is no window to open a panel in', async () => {
        mock.sync.data[OPEN_IN_KEY] = 'sidePanel'

        await openConfiguredSurface(undefined)

        expect(mock.surface.opened).toEqual([])
        expect(mock.surface.openPopupCalls).toBe(1)
    })

    test('does nothing on a Chrome without action.openPopup rather than throwing', async () => {
        delete (mock.chrome.action as { openPopup?: unknown }).openPopup

        await expect(openConfiguredSurface(12)).resolves.toBeUndefined()
    })
})

describe('sidePanelAvailable', () => {
    test('is true where the API exists', () => {
        expect(sidePanelAvailable()).toBe(true)
    })

    test('is false on Chrome 113 and older', () => {
        withoutSidePanel()

        expect(sidePanelAvailable()).toBe(false)
    })
})
