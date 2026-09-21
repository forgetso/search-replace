import { LangFile, LangList, SearchReplaceBackgroundMessage } from '../types'
import { getStorageSync } from './storage'

const DEFAULT_LANGUAGE = 'en'

/** Reads a JSON file that ships with the extension */
async function fetchExtensionJSON<T>(path: string): Promise<T> {
    const response = await fetch(chrome.runtime.getURL(path))
    if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status}`)
    }
    return (await response.json()) as T
}

export function getAvailableLanguages(): Promise<LangList[]> {
    return fetchExtensionJSON<LangList[]>('_locales/list.json')
}

export function loadLocalizedContent(lng: string): Promise<LangFile['data']> {
    return fetchExtensionJSON<LangFile['data']>(`_locales/${lng}/messages.json`)
}

async function getTranslation(): Promise<LangFile> {
    const preferredLanguage = await getStorageSync<string>('preferredLanguage')
    const lng = preferredLanguage || DEFAULT_LANGUAGE
    const [data, dataFallback] = await Promise.all([
        loadLocalizedContent(lng),
        // The fallback is only fetched separately when it differs from the chosen language
        lng === DEFAULT_LANGUAGE ? loadLocalizedContent(lng) : loadLocalizedContent(DEFAULT_LANGUAGE),
    ])
    return { data, dataFallback }
}

export function listenerTranslations(
    request: SearchReplaceBackgroundMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (arg0: unknown) => void
) {
    if (request.action === 'getTranslation') {
        getTranslation()
            .then(sendResponse)
            .catch((error) => {
                console.error('TRANSLATIONS: Error getting translation:', error)
                // Reply regardless, otherwise the popup waits on a message that never arrives
                sendResponse({ data: {}, dataFallback: {} })
            })
    }
    if (request.action === 'getAvailableLanguages') {
        getAvailableLanguages()
            .then(sendResponse)
            .catch((error) => {
                console.error('TRANSLATIONS: Error getting available languages:', error)
                sendResponse([])
            })
    }
    return true
}
