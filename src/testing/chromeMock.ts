// A minimal in-memory stand-in for the parts of the `chrome.*` extension API that this
// codebase touches. Several modules (`util.ts`, `searchreplace.ts`, `popup.ts`) read from
// `chrome` at import time, so this has to be installed before those modules are required.
//
// `get`/`set`/`remove` support both the callback and the promise style, because the codebase
// uses both.

type StorageRecord = Record<string, unknown>

export interface MockStorageArea {
    /** Direct access to the backing store, for arranging and asserting in tests */
    data: StorageRecord
    get(
        keys: string | string[] | StorageRecord | null,
        callback?: (items: StorageRecord) => void
    ): Promise<StorageRecord>
    set(items: StorageRecord, callback?: () => void): Promise<void>
    remove(keys: string | string[], callback?: () => void): Promise<void>
    clear(): Promise<void>
}

function createStorageArea(initial: StorageRecord = {}): MockStorageArea {
    const area: MockStorageArea = {
        data: { ...initial },
        get(keys, callback) {
            let items: StorageRecord = {}
            if (keys === null || keys === undefined) {
                items = { ...area.data }
            } else if (typeof keys === 'string') {
                if (keys in area.data) items[keys] = area.data[keys]
            } else if (Array.isArray(keys)) {
                for (const key of keys) {
                    if (key in area.data) items[key] = area.data[key]
                }
            } else {
                // object form supplies defaults for missing keys
                for (const [key, fallback] of Object.entries(keys)) {
                    items[key] = key in area.data ? area.data[key] : fallback
                }
            }
            if (callback) callback(items)
            return Promise.resolve(items)
        },
        set(items, callback) {
            Object.assign(area.data, items)
            if (callback) callback()
            return Promise.resolve()
        },
        remove(keys, callback) {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
                delete area.data[key]
            }
            if (callback) callback()
            return Promise.resolve()
        },
        clear() {
            area.data = {}
            return Promise.resolve()
        },
    }
    return area
}

/** Collects listeners so tests can assert registration and drive them manually */
function createEvent<T extends (...args: never[]) => unknown>() {
    const listeners: T[] = []
    return {
        listeners,
        addListener: (listener: T) => {
            listeners.push(listener)
        },
        removeListener: (listener: T) => {
            const index = listeners.indexOf(listener)
            if (index > -1) listeners.splice(index, 1)
        },
        hasListener: (listener: T) => listeners.indexOf(listener) > -1,
    }
}

export interface ChromeMock {
    local: MockStorageArea
    sync: MockStorageArea
    /** Every message passed to `chrome.runtime.sendMessage` */
    sentRuntimeMessages: unknown[]
    /** Every message passed to `chrome.tabs.sendMessage`, with its target tab id */
    sentTabMessages: { tabId: number; message: unknown }[]
    /** Every message posted through a port returned by `chrome.runtime.connect` */
    postedPortMessages: unknown[]
    /** Replies handed back by `chrome.runtime.sendMessage`, keyed by message action */
    runtimeResponses: Record<string, unknown>
    /** Tabs returned by `chrome.tabs.query`; set this to arrange a test */
    tabs: { id?: number; url?: string }[]
    /** Every `chrome.scripting.executeScript` call that was allowed to succeed */
    executedScripts: { tabId: number; files: string[] }[]
    /** Tab ids for which `chrome.scripting.executeScript` should reject, as restricted pages do */
    blockedTabIds: Set<number>
    /** Tab ids with no content script listening, as a page loaded before the extension has */
    tabsWithoutContentScript: Set<number>
    /** Tab ids where injecting does not help, e.g. the tab navigated away mid-flight */
    injectionDoesNotHelp: Set<number>
    /** Set to make `chrome.tabs.sendMessage` reject with something other than a missing receiver */
    tabMessageError?: Error
    /** Calls recorded from the action, sidePanel and windows APIs */
    surface: SurfaceCalls
    chrome: typeof chrome
}

/** What the popup-or-side-panel code did to the browser, for background/surface.ts's tests */
export interface SurfaceCalls {
    /** Every `chrome.action.setPopup` call, in order */
    setPopup: string[]
    /** Every `chrome.sidePanel.setPanelBehavior` call, in order */
    panelBehaviour: boolean[]
    /** Every `chrome.sidePanel.setOptions` call, in order */
    panelOptions: { path?: string; enabled?: boolean }[]
    /** Window ids passed to `chrome.sidePanel.open` */
    opened: (number | undefined)[]
    /** How many times `chrome.action.openPopup` was called */
    openPopupCalls: number
}

export function createChromeMock(options: { version?: string } = {}): ChromeMock {
    const local = createStorageArea()
    const sync = createStorageArea()
    const sentRuntimeMessages: unknown[] = []
    const sentTabMessages: { tabId: number; message: unknown }[] = []
    const postedPortMessages: unknown[] = []
    const runtimeResponses: Record<string, unknown> = {}
    const tabs: { id?: number; url?: string }[] = [{ id: 1, url: 'https://example.com/' }]
    const executedScripts: { tabId: number; files: string[] }[] = []
    const blockedTabIds = new Set<number>()
    const tabsWithoutContentScript = new Set<number>()
    const injectionDoesNotHelp = new Set<number>()
    const state: { tabMessageError?: Error } = {}
    const surface: SurfaceCalls = {
        setPopup: [],
        panelBehaviour: [],
        panelOptions: [],
        opened: [],
        openPopupCalls: 0,
    }

    function respondTo(message: unknown): unknown {
        const action = (message as { action?: string } | undefined)?.action
        return action && action in runtimeResponses ? runtimeResponses[action] : undefined
    }

    const mock = {
        runtime: {
            id: 'mock-extension-id',
            getManifest: () => ({ version: options.version ?? '0.0.0-test' }),
            getURL: (path: string) => `chrome-extension://mock-extension-id/${path}`,
            onMessage: createEvent(),
            onConnect: createEvent(),
            onInstalled: createEvent(),
            sendMessage: (message: unknown, callback?: (response: unknown) => void) => {
                sentRuntimeMessages.push(message)
                const response = respondTo(message)
                if (callback) callback(response)
                return Promise.resolve(response)
            },
            connect: () => ({
                name: 'Search and Replace',
                postMessage: (message: unknown) => {
                    postedPortMessages.push(message)
                },
                onMessage: createEvent(),
                onDisconnect: createEvent(),
                disconnect: () => undefined,
            }),
        },
        storage: {
            local,
            sync,
            onChanged: createEvent(),
        },
        tabs: {
            query: () => Promise.resolve(tabs),
            sendMessage: (tabId: number, message: unknown) => {
                if (state.tabMessageError) {
                    return Promise.reject(state.tabMessageError)
                }
                if (tabsWithoutContentScript.has(tabId)) {
                    // Mirrors Chrome's wording when no content script is listening
                    return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'))
                }
                sentTabMessages.push({ tabId, message })
                return Promise.resolve()
            },
            create: () => Promise.resolve({}),
            onUpdated: createEvent(),
            onActivated: createEvent(),
        },
        scripting: {
            executeScript: (injection: { target: { tabId: number }; files: string[] }) => {
                if (blockedTabIds.has(injection.target.tabId)) {
                    // Mirrors Chrome's behaviour on chrome://, the Web Store and other pages the
                    // extension has no host access to
                    return Promise.reject(new Error('Cannot access contents of the page'))
                }
                executedScripts.push({ tabId: injection.target.tabId, files: injection.files })
                if (!injectionDoesNotHelp.has(injection.target.tabId)) {
                    // Injecting gives the tab a listener, so a retry now succeeds
                    tabsWithoutContentScript.delete(injection.target.tabId)
                }
                return Promise.resolve([])
            },
        },
        action: {
            setPopup: (details: { popup: string }) => {
                surface.setPopup.push(details.popup)
                return Promise.resolve()
            },
            openPopup: () => {
                surface.openPopupCalls++
                return Promise.resolve()
            },
        },
        // Present only where the test arranges it, so that the Chrome-114-and-older path can be
        // exercised by deleting it
        sidePanel: {
            setOptions: (options: { path?: string; enabled?: boolean }) => {
                surface.panelOptions.push(options)
                return Promise.resolve()
            },
            setPanelBehavior: (behavior: { openPanelOnActionClick?: boolean }) => {
                surface.panelBehaviour.push(behavior.openPanelOnActionClick === true)
                return Promise.resolve()
            },
            open: (options: { windowId?: number }) => {
                surface.opened.push(options.windowId)
                return Promise.resolve()
            },
        },
        windows: {
            getCurrent: () => Promise.resolve({ id: 7 }),
        },
        commands: {
            onCommand: createEvent(),
        },
        i18n: {
            getAcceptLanguages: (callback: (languages: string[]) => void) => callback(['en']),
        },
        notifications: {
            create: () => undefined,
        },
    }

    return {
        local,
        sync,
        sentRuntimeMessages,
        sentTabMessages,
        postedPortMessages,
        runtimeResponses,
        tabs,
        executedScripts,
        blockedTabIds,
        tabsWithoutContentScript,
        injectionDoesNotHelp,
        surface,
        get tabMessageError() {
            return state.tabMessageError
        },
        set tabMessageError(error: Error | undefined) {
            state.tabMessageError = error
        },
        // The mock deliberately implements only the surface this codebase uses
        chrome: mock as unknown as typeof chrome,
    }
}

/** Installs a fresh mock onto `globalThis.chrome` and returns it */
export function installChromeMock(options: { version?: string } = {}): ChromeMock {
    const mock = createChromeMock(options)
    ;(globalThis as { chrome?: typeof chrome }).chrome = mock.chrome
    return mock
}
