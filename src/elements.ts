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

export function getIframeElements(document: Document): HTMLIFrameElement[] {
    return Array.from(<NodeListOf<HTMLIFrameElement>>document.querySelectorAll('iframe')).filter(
        (iframe) => iframe.src.length && !isBlobIframe(iframe)
    )
}

export function inIframe() {
    return window !== window.top
}

// Functions for dealing with hidden elements

function ancestorIsHidden(element: Element) {
    let parent = element.parentElement
    while (parent) {
        if (!isVisible(parent)) {
            return true
        }
        parent = parent.parentElement
    }
    return false
}

export function isVisible(element: HTMLElement | Element) {
    // if it's an input, return whether the input is not hidden
    if (element.nodeName === 'INPUT') {
        const inputElement = element as HTMLInputElement
        return inputElement.type !== 'hidden'
    }
    // if the element has style
    if (element && 'style' in element) {
        // check if the element is hidden by style
        // return whether the inputs style is != none
        return element.style.display !== 'none'
    }
    // otherwise the element is not visible
    return false
}

export function elementIsVisible(element: HTMLElement, ancestorCheck = true): boolean {
    // check the immediate element to see if it's visible based on its style
    if (!isVisible(element)) {
        return false
    }
    // optionally skip the ancestor check and return indicating that the element is visible
    if (!ancestorCheck) {
        return true
    }
    // otherwise check up the tree to see if any ancestors are hidden
    return !ancestorIsHidden(element)
}

export function copyElementAndRemoveSelectedElements(
    originalElement: HTMLElement,
    selectorFn: (e: HTMLElement, ...args: any) => boolean,
    selectorFnArgs: any[],
    parentPath = []
) {
    let elementCopy = originalElement.cloneNode(true) as HTMLElement
    const removedMap = new Map<HTMLElement, number[]>()

    function removeSelectedElements(element: HTMLElement, path: number[]) {
        if (element) {
            const childNodes = <HTMLElement[]>Array.from(element.children)
            for (let childIndex = 0; childIndex < childNodes.length; childIndex++) {
                let child = childNodes[childIndex]
                const childPath = [...path, childIndex]

                if (!selectorFn(child as HTMLElement, ...selectorFnArgs)) {
                    // Save hidden element and its path in the map
                    removedMap.set(child, childPath)
                    // Remove the hidden element from the copy
                    if (child) {
                        element.removeChild(child)
                    }
                } else {
                    // Recursively process visible child elements
                    child = removeSelectedElements(child, childPath)

                    if (element.children[childIndex] && child !== element.children[childIndex]) {
                        element = <HTMLElement>element.replaceChild(child, element.children[childIndex])
                    }
                }
            }
        }
        return element
    }

    elementCopy = removeSelectedElements(elementCopy, [])

    return { elementCopy, removedMap }
}

export function restoreRemovedElements(elementCopy: Element, removedMap: Map<Element, number[]>) {
    let parentElement = elementCopy

    removedMap.forEach((path, hiddenElement) => {
        for (const pathIndex of path.slice(0, path.length - 1)) {
            if (parentElement.children[pathIndex]) {
                parentElement = parentElement.children[pathIndex]
            }
        }

        if (!hiddenElement.contains(parentElement)) {
            parentElement.appendChild(hiddenElement)
        }
    })
    return elementCopy
}
