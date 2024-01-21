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
    const removedMap = new Map<number[], HTMLElement>()

    function removeSelectedElements(element: HTMLElement, path: number[]) {
        if (element) {
            const childNodes = <HTMLElement[]>Array.from(element.children)
            for (let childIndex = 0; childIndex < childNodes.length; childIndex++) {
                let child = childNodes[childIndex]
                const childPath = [...path, childIndex]

                if (!selectorFn(child as HTMLElement, ...selectorFnArgs)) {
                    // Save hidden element and its path in the map
                    removedMap.set(childPath, child)
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

function childIndex(parent: HTMLElement, element: HTMLElement) {
    return Array.from(parent.children).indexOf(element)
}

export class PathTreeWalker {
    private walker: TreeWalker
    private path: number[] = [0]
    private _previousNode: Node | null = null

    constructor(public document: Document, public start: Node, public nodeType: number | undefined) {
        this.walker = document.createTreeWalker(start, nodeType)
    }

    public nextNode(): Element | null {
        this.previousNode = this.currentNode
        const node = this.walker.nextNode()
        if (node) {
            this.currentPath = this.buildPath()
        }
        return node as Element | null
    }

    private buildPath() {
        const path = this.currentPath
        console.log('path', path)
        // Case 1
        // Starting element, e.g. <body>
        // If the parent (<html>) childNodes have an index of `element` then we are at the start. The path is [0]
        // Do nothing as path is initialised as [0]

        // Case 2 - Down the tree
        // If we are in a <div> under <body> and the currentNode is a child node of the previousNode (<body>) then
        // append the node index to the path
        if (this.previousNode) {
            const previousIndex = childIndex(this.previousNode, this.currentNode)
            if (previousIndex > -1) {
                console.log("found current node in previous node's children", this.currentNode, this.previousNode)
                path.push(previousIndex)
            }
        }
        if (this.previousNode) {
            // Case 3 - Sideways or up in the tree
            // We have traversed sideways in the tree so remove n levels from the path and take the child index
            // of the node that is a parent of the currentNode
            // e.g. [0, 1, 2, 8, 12] -> [0, 2], we need to traverse back up the tree using the path to get to the
            // parent of the currentNode and then get the child index of the currentNode
            while (this.previousNode && childIndex(this.previousNode, this.currentNode) === -1) {
                path.pop()
                this.previousNode = this.previousNode.parentElement
            }
            if (this.previousNode) {
                console.log(
                    'found parent of current node by traversing up the tree',
                    this.currentNode,
                    this.previousNode
                )
                path.push(childIndex(this.previousNode, this.currentNode))
            } else {
                throw new Error("Can't find parent of currentNode")
            }
        }
        return path
    }

    get currentNode(): HTMLElement {
        console.log('this.nodeType ', this.walker.currentNode.nodeType, Node.TEXT_NODE)
        if (this.walker.currentNode.nodeType === Node.TEXT_NODE) {
            if (this.walker.currentNode.parentElement) {
                return this.walker.currentNode.parentElement
            } else {
                throw new Error('Text node has no parent element')
            }
        }
        if (this.walker.currentNode.nodeType === Node.ELEMENT_NODE) {
            return this.walker.currentNode as HTMLElement
        }
        throw new Error('currentNode is not an HTMLElement')
    }

    get previousNode(): HTMLElement | null {
        if (this._previousNode) {
            if (this._previousNode.nodeType === Node.TEXT_NODE) {
                if (this._previousNode.parentElement) {
                    return this._previousNode.parentElement
                } else {
                    throw new Error('Text node has no parent element')
                }
            }
            if (this._previousNode.nodeType === Node.ELEMENT_NODE) {
                return this._previousNode as HTMLElement
            }
            throw new Error('previousNode is not an HTMLElement')
        }
        return null
    }

    set previousNode(node: Node | null) {
        this._previousNode = node
    }

    get currentPath() {
        return this.path
    }

    set currentPath(path: number[]) {
        this.path = path
    }

    get parentNode() {
        return this.currentNode?.parentElement
    }
}
