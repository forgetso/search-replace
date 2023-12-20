import { LangFile, LangList, SearchReplaceInstance, TranslationProxy } from './types'

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
}
