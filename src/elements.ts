// Utils for dealing with Elements

import { SearchReplaceResult } from './types'

export function getInputElements(
    document: Document,
    elementFilter: Map<Element, SearchReplaceResult>,
    hiddenContent?: boolean
): (HTMLInputElement | HTMLTextAreaElement)[] {
    const inputs = Array.from(
        <NodeListOf<HTMLInputElement>>document.querySelectorAll('input,textarea,div[contenteditable="true"]')
    )
    const visibleElements = !hiddenContent ? inputs.filter((input) => elementIsVisible(input, true, false)) : inputs
    return visibleElements.filter((input) => !elementFilter.has(input))
}

export function isBlobIframe(el: Element) {
    return el.tagName === 'IFRAME' && 'src' in el && typeof el.src === 'string' && el.src.startsWith('blob:')
}

export function getIframeElements(document: Document, blob = false): HTMLIFrameElement[] {
    return Array.from(<NodeListOf<HTMLIFrameElement>>document.querySelectorAll('iframe')).filter(
        (iframe) =>
            // We don't want empty iframes
            iframe.src.length &&
            // We don't want to count iframes injected by other chrome extensions
            !iframe.src.startsWith('chrome-extension://') &&
            // We may or may not want blob iframes
            (blob ? isBlobIframe(iframe) : !isBlobIframe(iframe))
    )
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

    if (element && 'style' in element && element.style.display === 'none') {
        // if the element has style return true if the style is `none`
        return true
    }

    // clones are not visible so we can't use checkVisibility
    if (!cloned && 'checkVisibility' in element && typeof element.checkVisibility === 'function') {
        // use the relatively new checkVisibility method, which returns `true` if the element is visible
        return !element.checkVisibility()
    }

    // This method is not as accurate as checkVisibility
    // compute the style as its not immediately obvious if the element is hidden
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
