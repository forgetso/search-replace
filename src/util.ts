// Shared utils between the background and content scripts

import {
    Hint,
    HintPreferences,
    LangFile,
    LangList,
    SearchReplaceInstance,
    SearchReplaceResponse,
    SearchReplaceResult,
    TranslationProxy,
} from './types'

export const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed,
        h2 = 0x41c6ce57 ^ seed
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i)
        h1 = Math.imul(h1 ^ ch, 2654435761)
        h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)

    return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export function getInstanceId(instance: SearchReplaceInstance, useUrl: boolean) {
    return cyrb53(
        `${useUrl && instance.url ? instance.url : ''}${instance.searchTerm}${instance.replaceTerm}${JSON.stringify(
            instance.options
        )}`
    )
}

export function tabConnect() {
    return chrome.runtime.connect(null!, {
        name: 'Search and Replace',
    })
}

let manifestJSON = {
    version: 'test',
}
if (chrome && chrome.runtime) {
    manifestJSON = chrome.runtime.getManifest()
}
export const manifest = manifestJSON

// Function to clear any saved responses
export function clearSavedResponses(): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage({ action: 'clearSavedResponses' }, (result) => {
                resolve(result)
            })
        } catch (e) {
            reject(e)
        }
    })
}

// Function to retrieve the translation data
export function getTranslation(): Promise<LangFile> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getTranslation' }, (translation) => {
            console.log('UTIL: getTranslation', translation)
            resolve(translation)
        })
    })
}

// Function to retrieve the list of available languages
export function getAvailableLanguages(): Promise<LangList[]> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getAvailableLanguages' }, (availableLanguages) => {
            resolve(availableLanguages)
        })
    })
}

// Function to create a translation proxy
export function createTranslationProxy(translationData: LangFile): TranslationProxy {
    return (key: string) => {
        if (translationData.data[key]) {
            // Use the selected language translation
            return translationData.data[key].message
        } else if (translationData.dataFallback[key]) {
            // Use the fallback language translation
            return translationData.dataFallback[key].message
        } else {
            // Return the key itself if no translation is available
            return key
        }
    }
}

// Function to localize HTML elements using translation data
export function localizeElements(translationData: LangFile, callback: () => void) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && 'preferredLanguage' in changes) {
            // Reload the page when the preferredLanguage is changed
            location.reload()
        }
    })
    console.log('UTIL: localizeElements, translationData', translationData)
    document.querySelectorAll('[data-locale]').forEach((elem) => {
        const element = elem as HTMLElement
        const localeKey = element.getAttribute('data-locale')

        if (localeKey) {
            let innerString: string
            if (translationData.data[localeKey]) {
                innerString = translationData.data[localeKey].message
            } else if (translationData.dataFallback[localeKey]) {
                innerString = translationData.dataFallback[localeKey].message
            } else {
                innerString = localeKey
            }
            element.innerHTML = innerString // Use innerHTML to render HTML content
        }
    })
    callback();
}

export function getExtensionStorage<T>(key: string): Promise<T | undefined> {
    return new Promise((resolve) => {
        chrome.storage.local.get(key, (data: { [key: string]: T }) => {
            resolve(data[key])
        })
    })
}

function mergeHints(hintA: Hint[], hintB: Hint[], hintPreferences: HintPreferences): Hint[] {
    return [...(hintA || []), ...(hintB || [])]
        .filter((hint, index, hintsObj) => hintsObj.findIndex((v2) => v2.name === hint.name) === index)
        .filter((hint) => {
            return !hintPreferences[hint.name]
        })
}

export function mergeSearchReplaceResponse(
    a: SearchReplaceResponse,
    b: SearchReplaceResponse,
    hintPreferences: HintPreferences
): SearchReplaceResponse {
    return {
        instance: a.instance,
        inIframe: a.inIframe,
        hints: mergeHints(a.hints || [], b.hints || [], hintPreferences),
        location: a.location,
        result: mergeSearchReplaceResults(a.result, b.result),
        action: a.action,
        iframes: a.iframes,
        backgroundReceived: a.backgroundReceived + b.backgroundReceived,
        host: a.host,
    }
}

export function mergeSearchReplaceResults(a: SearchReplaceResult, b: SearchReplaceResult): SearchReplaceResult {
    return {
        count: {
            original: a.count.original + b.count.original,
            replaced: a.count.replaced + b.count.replaced,
        },
        replaced: a.replaced || b.replaced,
    }
}

export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined
}
