// Utils for dealing with Elements

import { SearchReplaceResult } from './types'

export function getInputElements(
    document: Document,
    elementFilter: Map<Element, SearchReplaceResult>,
    visibleOnly?: boolean
): (HTMLInputElement | HTMLTextAreaElement)[] {
    const inputs = Array.from(<NodeListOf<HTMLInputElement>>document.querySelectorAll('input,textarea'))
    const visibleElements = visibleOnly ? inputs.filter((input) => elementIsVisible(input)) : inputs
    return visibleElements.filter((input) => !elementFilter.has(input))
}

export function isBlobIframe(el: Element) {
    return el.tagName === 'IFRAME' && 'src' in el && typeof el.src === 'string' && el.src.startsWith('blob:')
}

export function getIframeElements(document: Document, blob = false): HTMLIFrameElement[] {
    return Array.from(<NodeListOf<HTMLIFrameElement>>document.querySelectorAll('iframe')).filter(
        (iframe) => iframe.src.length && (blob ? isBlobIframe(iframe) : !isBlobIframe(iframe))
    )
}

export function inIframe() {
    return window !== window.top
}

// Check if any ancestors of an element are hidden
function ancestorIsHidden(element: Element, cloned = false) {
    let parent = element.parentElement
    while (parent && parent.tagName !== 'HTML') {
        if (!isVisible(parent, cloned)) {
            return true
        }
        parent = parent.parentElement
    }
    return false
}

export function isVisible(element: HTMLElement | Element, cloned = false) {
    // clones are not visible so we can't use checkVisibility
    if (!cloned && 'checkVisibility' in element && typeof element.checkVisibility === 'function') {
        // use the relatively new checkVisibility method, which returns `true` if the element is visible

        return element.checkVisibility()
    }

    if (element.nodeName === 'INPUT') {
        const inputElement = element as HTMLInputElement
        // if it's an input, return true if the input is not `hidden`
        return inputElement.type !== 'hidden'
    }

    if (element && 'style' in element) {
        // if the element has style return true if the style is something other than `none`
        return element.style.display !== 'none'
    }
    // otherwise we assume the element is not visible
    return false
}

export function elementIsVisible(element: HTMLElement, ancestorCheck = true, cloned = false): boolean {
    // check the immediate element to see if it's visible based on its style
    if (!isVisible(element, cloned)) {
        return false
    }
    // optionally skip the ancestor check and return indicating that the element is visible
    if (!ancestorCheck || element.tagName === 'BODY') {
        return true
    }
    // otherwise check up the tree to see if any ancestors are hidden
    return !ancestorIsHidden(element, cloned)
}

export function copyElementAndRemoveSelectedElements(
    originalElement: HTMLElement,
    selectorFn: (e: HTMLElement, ...args: any) => boolean
) {
    let elementCopy = originalElement.cloneNode(true) as HTMLElement
    const removedSet = new Set<HTMLElement>()

    function removeSelectedElements(element: HTMLElement) {
        if (element) {
            const childNodes = <HTMLElement[]>Array.from(element.children)
            for (let childIndex = 0; childIndex < childNodes.length; childIndex++) {
                let child = childNodes[childIndex]

                if (selectorFn(child as HTMLElement)) {
                    // Save hidden element and its path in the map
                    removedSet.add(child)
                    // Remove the hidden element from the copy
                    if (child) {
                        element.removeChild(child)
                    }
                } else {
                    // Recursively process visible child elements
                    child = removeSelectedElements(child)

                    if (element.children[childIndex] && child !== element.children[childIndex]) {
                        element = <HTMLElement>element.replaceChild(child, element.children[childIndex])
                    }
                }
            }
        }
        return element
    }

    elementCopy = removeSelectedElements(elementCopy)

    return { elementCopy, removedSet }
}
