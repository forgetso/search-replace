import {
    LangFile,
    LangList,
    RegexFlags,
    SavedSearchReplaceInstance,
    SearchReplaceStorageMessage,
    TranslationProxy,
} from './types'
import { Simulate } from 'react-dom/test-utils'
import input = Simulate.input

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

export function getSavedInstanceId(instance: SavedSearchReplaceInstance) {
    return cyrb53(`${instance.url}${instance.searchTerm}${instance.replaceTerm}${JSON.stringify(instance.options)}`)
}

export function tabConnect() {
    return chrome.runtime.connect(null!, {
        name: 'Search and Replace',
    })
}

export const recoverMessage: SearchReplaceStorageMessage = {
    actions: { recover: true },
}

export const clearHistoryMessage: SearchReplaceStorageMessage = {
    actions: { clearHistory: true },
}

export function getInputElements(
    document: Document,
    visibleOnly?: boolean
): (HTMLInputElement | HTMLTextAreaElement)[] {
    const inputs = Array.from(<NodeListOf<HTMLInputElement>>document.querySelectorAll('input,textarea'))
    return visibleOnly ? inputs.filter((input) => elementIsVisible(input)) : inputs
}

export function getIframeElements(document: Document): HTMLIFrameElement[] {
    return Array.from(<NodeListOf<HTMLIFrameElement>>document.querySelectorAll('iframe'))
}

export function getSearchOccurrences(
    document: Document,
    searchPattern: RegExp,
    visibleOnly: boolean,
    inputFieldsOnly?: boolean,
    iframe?: boolean
): number {
    let matches
    let iframeMatches = 0
    if (visibleOnly && !inputFieldsOnly) {
        // Get visible matches only, anywhere on the page
        matches = document.body.innerText.match(searchPattern) || []
        const inputs = getInputElements(document, visibleOnly)
        const inputMatches = inputs.map((input) => input.value.match(searchPattern) || [])

        // combine the matches from the body and the inputs and remove empty matches
        matches = [...matches, ...inputMatches].filter((match) => match.length > 0).flat()
    } else if (inputFieldsOnly) {
        // Get matches in input fields only, visible or hidden, depending on `visibleOnly`
        const inputs = getInputElements(document, visibleOnly)
        const inputMatches = inputs.map((input) => input.value.match(searchPattern) || [])
        matches = inputMatches.filter((match) => match.length > 0).flat()
    } else {
        // Get matches anywhere in the page, visible or not
        matches = Array.from(document.body.innerHTML.match(searchPattern) || [])
    }

    // Now check in any iframes by calling this function again, summing the total number of matches from each iframe
    const iframes = getIframeElements(document)
    if (!iframe) {
        iframeMatches = iframes
            .map((iframe) => {
                try {
                    return getSearchOccurrences(
                        iframe.contentDocument!,
                        searchPattern,
                        visibleOnly,
                        inputFieldsOnly,
                        true
                    )
                } catch (e) {
                    return 0
                }
            })
            .reduce((a, b) => a + b, 0)
    }

    let occurences = 0
    if (matches) {
        console.debug(
            `Matches ${matches.length}, Iframe matches: ${iframeMatches}, Total: ${matches.length + iframeMatches}`
        )
        occurences = matches.length + iframeMatches
    }

    return occurences
}

export function elementIsVisible(element: HTMLElement): boolean {
    if (element && 'style' in element) {
        const styleVisible = element.style.display !== 'none'
        if (element.nodeName === 'INPUT') {
            const inputElement = element as HTMLInputElement
            return inputElement.type !== 'hidden' && styleVisible
        } else {
            return styleVisible
        }
    }
    return false
}

export function inIframe() {
    return window !== window.top
}
let manifestJSON = {
    version: 'test',
}
if (chrome && chrome.runtime) {
    manifestJSON = chrome.runtime.getManifest()
}
export const manifest = manifestJSON

// Function to retrieve the translation data
export function getTranslation(): Promise<LangFile> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getTranslation' }, (translation) => {
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
export function localizeElements(translationData: LangFile) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && 'preferredLanguage' in changes) {
            // Reload the page when the preferredLanguage is changed
            location.reload()
        }
    })

    document.querySelectorAll('[data-locale]').forEach((elem) => {
        const element = elem as HTMLElement
        const localeKey = element.getAttribute('data-locale')

        if (localeKey) {
            let innerString
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
}
