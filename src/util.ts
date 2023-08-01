import { RegexFlags, SavedSearchReplaceInstance, SearchReplaceStorageMessage } from './types'

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

function getInputElements(document: Document, visibleOnly?: boolean): (HTMLInputElement | HTMLTextAreaElement)[] {
    return Array.from(<NodeListOf<HTMLInputElement>>document.querySelectorAll('input,textarea')).filter((input) =>
        elementIsVisible(input)
    )
}

export function getSearchOccurrences(
    document: Document,
    searchPattern: RegExp,
    visibleOnly: boolean,
    iframe?: boolean
): number {
    let matches
    let iframeMatches = 0
    if (visibleOnly) {
        matches = document.body.innerText.match(searchPattern) || []
        const inputs = getInputElements(document, visibleOnly)
        const inputMatches = inputs.map((input) => input.value.match(searchPattern) || [])

        if (!iframe) {
            const iframes = Array.from(document.querySelectorAll('iframe'))
            iframeMatches = iframes
                .map((iframe) => {
                    try {
                        return getSearchOccurrences(iframe.contentDocument!, searchPattern, visibleOnly, true)
                    } catch (e) {
                        return 0
                    }
                })
                .reduce((a, b) => a + b, 0)
        }
        // combine the matches from the body and the inputs and remove empty matches
        matches = [...matches, ...inputMatches].filter((match) => match.length > 0).flat()
    } else {
        matches = Array.from(document.body.innerHTML.match(searchPattern) || [])
    }
    let occurences = 0
    if (matches) {
        occurences = matches.length + iframeMatches
    }

    return occurences
}

export function elementIsVisible(element: HTMLElement): boolean {
    const styleVisible = element.style.display !== 'none'

    if (element.nodeName === 'INPUT') {
        const inputElement = element as HTMLInputElement
        return inputElement.type !== 'hidden' && styleVisible
    } else {
        return styleVisible
    }
}

export function inIframe() {
    return window !== window.top
}
