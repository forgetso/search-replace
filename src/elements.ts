// Utils for dealing with Elements

import { HINTS, INPUT_TEXTAREA_CONTENT_EDITABLE_SELECTOR, RICH_TEXT_EDITORS } from './constants'
import { SearchReplaceResult } from './types'
import { notEmpty } from './util'

export function getInputElements(
    document: HTMLElement | Document,
    elementFilter: Map<Element, SearchReplaceResult>,
    hiddenContent?: boolean
): (HTMLInputElement | HTMLTextAreaElement)[] {
    const inputs = Array.from(
        <NodeListOf<HTMLInputElement>>document.querySelectorAll(INPUT_TEXTAREA_CONTENT_EDITABLE_SELECTOR)
    )
    const visibleElements = !hiddenContent ? inputs.filter((input) => elementIsVisible(input, true, false)) : inputs
    return visibleElements.filter((input) => !elementFilter.has(input))
}

export function isInputElement(el: Element): el is HTMLInputElement {
    return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        (el.hasAttribute('contentEditable') && el.getAttribute('contentEditable') === 'true')
    )
}

export function isBlobIframe(el: Element) {
    return el.tagName === 'IFRAME' && 'src' in el && typeof el.src === 'string' && el.src.startsWith('blob:')
}

export function isWYSIWYGEditorIframe(el: Element) {
    return (
        RICH_TEXT_EDITORS.name.some((editor) => 'name' in el && el.name === editor) ||
        RICH_TEXT_EDITORS.class.some((editor) => containsPartialClass(el, editor))
    )
}

export function containsPartialClass(element: Element, partialClass: string) {
    return Array.from(element.classList).some((c) => c.includes(partialClass))
}

export function getLocalIframes(window: Window, document: Document): HTMLIFrameElement[] {
    return Array.from(<NodeListOf<HTMLIFrameElement>>document.querySelectorAll('iframe')).filter((iframe) => {
        return iframe.src === '' || iframe.src === 'about:blank' || iframe.src === window.location.href
    })
}

export function getWYSIWYGEditorIframes(window: Window, document: Document): HTMLIFrameElement[] {
    return getLocalIframes(window, document).filter((iframe) => {
        return isWYSIWYGEditorIframe(iframe)
    })
}

export function getBlobIframes(document: Document): HTMLIFrameElement[] {
    const blobIframes = Array.from(<NodeListOf<HTMLIFrameElement>>document.querySelectorAll('iframe')).filter(
        (iframe) => {
            return isBlobIframe(iframe)
        }
    )
    return blobIframes
}

export const waitForIframeLoad = async (iframe: HTMLIFrameElement): Promise<HTMLIFrameElement | null> => {
    return new Promise((resolve, reject) => {
        if (iframe.contentDocument) {
            if (iframe.contentDocument.readyState !== 'complete') {
                iframe.contentDocument.onreadystatechange = () => {
                    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                        resolve(iframe)
                    }
                }
            } else {
                resolve(iframe)
            }
        } else {
            resolve(null)
        }
    })
}

export async function getSearchableIframes(window: Window, document: Document): Promise<HTMLIFrameElement[]> {
    return (
        await Promise.all(
            [...getBlobIframes(document), ...getWYSIWYGEditorIframes(window, document)].map((iframe) => {
                return waitForIframeLoad(iframe)
            })
        )
    ).filter(notEmpty)
}

export function getRespondingIframes(window: Window, document: Document): HTMLIFrameElement[] {
    // we don't want to count iframes in gmail
    if (document.querySelector(HINTS['gmail'].selector) || window.location.href.indexOf(HINTS['gmail'].domain) > -1) {
        return []
    }

    return Array.from(<NodeListOf<HTMLIFrameElement>>document.querySelectorAll('iframe')).filter((iframe) => {
        const want =
            // loaded iframes containing a content script need to satisfy the following conditions
            iframe.src !== undefined &&
            // we don't want WYSIWYG editors that use iframes
            !getWYSIWYGEditorIframes(window, document).includes(iframe) &&
            // we don't want iframes with no src
            iframe.src.length > 0 &&
            // We don't want to count iframes injected by other chrome extensions
            !iframe.src.startsWith('chrome-extension://') &&
            // We only want to wait on iframes from the same origin OR blob iframes
            iframe.src.indexOf(window.location.origin) > -1 &&
            // We do not want blob iframes
            !isBlobIframe(iframe)
        return want
    })
}

export function inIframe() {
    return window !== window.top
}

// Check if any ancestors of an element are hidden
function ancestorIsVisible(element: Element, cloned = false) {
    let parent = element.parentElement
    while (parent && parent.tagName !== 'HTML') {
        if (isHidden(parent, cloned)) {
            return false
        }
        parent = parent.parentElement
    }
    return true
}

/**
 * Check if an element is hidden by checking the following conditions
 * - If the element is the body, assume it's visible and return `false`
 * - If the element is an input, return true if the input is `hidden`
 * - If the element has style return true if the style is `none`
 * - If the element is not a clone, does not have display:`contents`,
 *   and has a `checkVisibility` method, return the result of that method
 * - Get the computed style and return true if the computed style is `none`
 * - Otherwise return `false`
 * @param element
 * @param cloned
 */
export function isHidden(element: HTMLElement | Element, cloned = false) {
    if (element.tagName === 'BODY') {
        return false
    }

    if (element.nodeName === 'INPUT') {
        // if it's an input, return true if the input is `hidden`
        const inputElement = element as HTMLInputElement
        if (inputElement.type === 'hidden') {
            return true
        }
    }

    if (element && 'style' in element) {
        if (element.style.display === 'none') {
            // if the element has style return true if the style is `none`
            return true
        }

        if (
            // clones are not visible, so we can't use checkVisibility on them
            !cloned &&
            // checkVisibility currently returns false for elements with `display: contents`
            // https://chromium-review.googlesource.com/c/chromium/src/+/4950634
            element.style.display !== 'contents' &&
            'checkVisibility' in element &&
            typeof element.checkVisibility === 'function'
        ) {
            // use the relatively new checkVisibility method, which returns `true` if the element is visible
            return !element.checkVisibility()
        }
    }

    // This method is not as accurate as checkVisibility
    // compute the style as it's not immediately obvious if the element is hidden
    const computedStyle = getComputedStyle(element)

    if (computedStyle.display === 'none') {
        return true
    }

    // otherwise we assume the element is not visible
    return false
}

export function elementIsVisible(element: HTMLElement, ancestorCheck = true, cloned = false): boolean {
    // check the immediate element to see if it's visible based on its style
    if (isHidden(element, cloned)) {
        return false
    }
    // optionally skip the ancestor check and return indicating that the element is visible
    if (!ancestorCheck || element.tagName === 'BODY') {
        return true
    }
    // otherwise check up the tree to see if any ancestors are hidden
    return ancestorIsVisible(element, cloned)
}

export function getInitialIframeElement(iframe: HTMLIFrameElement): HTMLElement | null {
    let element: HTMLElement | null = null
    if (iframe.contentDocument) {
        element = iframe.contentDocument?.body || iframe.contentDocument?.querySelector('div')
    }
    return element
}

export function copyElementAndRemoveSelectedElements(
    originalElement: HTMLElement,
    selectorFn: (e: HTMLElement, ...args: any) => boolean,
    clone = true
) {
    let elementCopy = originalElement
    if (clone) {
        elementCopy = originalElement.cloneNode(true) as HTMLElement
    }
    const removedSet = new Set<HTMLElement>()

    function removeSelectedElements(element: HTMLElement) {
        if (element) {
            const childNodes = <HTMLElement[]>Array.from(element.children)

            for (const child of childNodes) {
                if (child.isEqualNode(element)) {
                    continue
                }

                if (selectorFn(child as HTMLElement)) {
                    // Remove the hidden element from the copy
                    if (child && element.contains(child)) {
                        element.removeChild(child)
                        // Save hidden element and its path in the map
                        removedSet.add(child)
                    }
                } else {
                    // Recursively process visible child elements
                    const newChild = removeSelectedElements(child as HTMLElement)
                    if (element.contains(child) && !newChild.isEqualNode(child)) {
                        element.replaceChild(newChild, child)
                    }
                }
            }
        }
        return element
    }

    elementCopy = removeSelectedElements(elementCopy)

    return { clonedElementRemoved: elementCopy, removedSet }
}
