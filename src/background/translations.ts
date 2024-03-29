import { LangFile, SearchReplaceBackgroundMessage } from '../types'
import { getStorageSync } from './storage'

export function getAvailableLanguages() {
    return new Promise((resolve, reject) => {
        const localePath = '_locales/list.json'
        console.log('TRANSLATIONS: Getting available languages from localePath', localePath)
        // Load the langlist content
        fetch(chrome.runtime.getURL(localePath))
            .then((response) => response.json())
            .then((data) => {
                resolve(data)
            })
            .catch((error) => {
                reject(error)
            })
    })
}

export function loadLocalizedContent(lng: string) {
    return new Promise((resolve, reject) => {
        const localePath = '_locales/' + lng + '/messages.json'
        console.log('TRANSLATIONS: Loading localized content from localePath', localePath)
        // Load the localized content
        fetch(chrome.runtime.getURL(localePath))
            .then((response) => response.json())
            .then((data) => {
                resolve(data)
            })
            .catch((error) => {
                reject(error)
            })
    })
}

function getTranslation() {
    return new Promise((resolve, reject) => {
        getStorageSync<string>('preferredLanguage')
            .then((result) => {
                console.log('TRANSLATIONS: Language translation storage', result)
                const lng = result || 'en'
                const lngFallback = 'en'
                Promise.all([loadLocalizedContent(lng), loadLocalizedContent(lngFallback)]).then((data) => {
                    resolve(data)
                })
            })
            .catch((error) => {
                console.error('TRANSLATIONS: Error getting translation:', error)
                reject(error)
            })
    })
}

export function listenerTranslations(
    request: SearchReplaceBackgroundMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (arg0: unknown) => void
) {
    if (request.action === 'getTranslation') {
        getTranslation().then((response) => {
            const [data, dataFallback] = response as [LangFile, LangFile]
            sendResponse({ data, dataFallback })
        })
    }
    if (request.action === 'getAvailableLanguages') {
        getAvailableLanguages().then((data) => {
            sendResponse(data)
        })
    }
    return true
}
