import { ELEMENT_FILTER } from './constants'
import {
    RegexFlags,
    ReplaceFunctionReturnType,
    SearchReplaceActions,
    SearchReplaceConfig,
    SearchReplaceContentMessage,
    SearchReplaceResponse,
    SearchReplaceResult,
} from './types/index'
import {
    copyElementAndRemoveSelectedElements,
    elementIsVisible,
    getIframeElements,
    getInitialIframeElement,
    getInputElements,
    inIframe,
    isBlobIframe,
    isHidden,
} from './elements'
import { getFlags, getSearchPattern } from './regex'
import { getHints } from './hints'
import { notEmpty } from './util'

function newSearchReplaceCount() {
    return {
        replaced: false,
        count: {
            original: 0,
            replaced: 0,
        },
    }
}

function updateResults(
    results: Map<Element, SearchReplaceResult>,
    element: Element,
    replaced: boolean,
    originalCount: number,
    replaceCount: number
) {
    const result = results.get(element) || newSearchReplaceCount()
    result.replaced = replaced
    result.count.original += originalCount
    result.count.replaced += replaceCount
    results.set(element, result)
    return results
}
function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const valueFn = Object.getOwnPropertyDescriptor(element, 'value')
    let valueSetter: ((v: string) => void) | undefined
    let prototypeValueSetter: ((v: string) => void) | undefined
    if (valueFn) {
        valueSetter = valueFn.set
    }
    const prototype = Object.getPrototypeOf(element)
    const prototypeValueFn = Object.getOwnPropertyDescriptor(prototype, 'value')
    if (prototypeValueFn) {
        prototypeValueSetter = prototypeValueFn.set
    }
    if (valueSetter && prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value)
    } else if (valueSetter) {
        valueSetter.call(element, value)
    } else {
        element.value = value
    }
}

function replaceInInput(
    config: SearchReplaceConfig,
    document: Document,
    input: HTMLInputElement | HTMLTextAreaElement,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    if (input.value !== undefined) {
        const oldValue = input.value
        const occurrences = oldValue.match(config.searchPattern)
        if (occurrences) {
            searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
            const newValue = input.value.replace(config.searchPattern, config.replaceTerm)

            if (config.replace && oldValue !== newValue) {
                input.focus()
                setNativeValue(input, newValue)
                const replaceCount = config.replaceAll ? occurrences.length : 1
                elementsChecked = updateResults(elementsChecked, input, true, occurrences.length, replaceCount)

                searchReplaceResult.count.replaced += replaceCount
                searchReplaceResult.replaced = true

                if (config.usesKnockout && document.documentElement) {
                    const knockoutValueChanger = getKnockoutValueChanger(input.id, newValue)
                    document.documentElement.setAttribute('onreset', knockoutValueChanger)
                    document.documentElement.dispatchEvent(new CustomEvent('reset'))
                    document.documentElement.removeAttribute('onreset')
                }

                // https://stackoverflow.com/a/53797269/1178971
                input.dispatchEvent(new Event('input', { bubbles: true }))

                input.blur()
            }
        }
    }
    return { searchReplaceResult, elementsChecked }
}

function containsAncestor(element: Element, results: Map<Element, SearchReplaceResult>, replaced?: boolean): boolean {
    // if element is not the body, check if the body is in the results
    if (element.tagName !== 'BODY' && results.has(document.body)) {
        return true
    }

    let ancestor = element.parentElement
    while (ancestor) {
        if (results.has(ancestor)) {
            return true
        }
        ancestor = ancestor.parentElement
    }
    return false
}

function countOccurrences(el: HTMLElement, config: SearchReplaceConfig): number {
    let target = el[config.searchTarget]

    if (config.hiddenContent && config.searchTarget === 'innerText' && 'textContent' in el) {
        // textContent contains text of visible and hidden elements
        target = (el as HTMLElement).textContent
    }

    const matches = target.match(config.globalSearchPattern) || []
    return matches.length
}

function replaceInElement(node: Element, oldValue: string, config: SearchReplaceConfig) {
    const occurrences = oldValue.match(config.globalSearchPattern) || []
    let replacementCount = 0
    let replace = false
    let replaced = false
    if (occurrences.length) {
        const newValue = oldValue.replace(config.searchPattern, config.replaceTerm)
        replace = oldValue != newValue
        if (replace) {
            replacementCount = config.replaceAll ? occurrences.length : 1 // adds one to replaced count if a replacement was made, adds occurrences if a global replace is made
            const nodeElement = getElementFromNode(node)

            if ('value' in nodeElement) {
                // TODO unify with replaceInInput, taking care not to count occurrences again
                nodeElement['value'] = newValue
                replaced = true
            }
            if (config.searchTarget === 'innerHTML') {
                node[config.searchTarget] = newValue
                replaced = true
            } else if (node.nodeValue) {
                // replace in innerText but use nodeValue only as innerText contains text of descendent elements
                node.nodeValue = newValue
                replaced = true
            }
        }
    }
    return { node, occurrences: occurrences.length, replacementCount, replaced }
}

function getElementFromNode(node: Node): Element {
    let element = node as Element
    if (node.nodeType === Node.TEXT_NODE) {
        if (node.parentElement) {
            element = node.parentElement
        } else {
            throw new Error('Text node has no parent element')
        }
    }
    if (!(element && element.nodeType === Node.ELEMENT_NODE)) {
        throw new Error('Unsupported node type')
    }
    return element
}

function isIgnored(ignoredElements: Set<Element>, node: Node, hiddenContent: boolean, elementFilter: RegExp): number {
    const toCheck = getElementFromNode(node)
    // if a script or an iframe that is not a blob iframe, reject
    if (toCheck.tagName.match(elementFilter) && !isBlobIframe(toCheck)) {
        return NodeFilter.FILTER_REJECT
    }
    // if an ignored element, reject
    if (ignoredElements.has(toCheck)) {
        return NodeFilter.FILTER_REJECT
    }

    // if the equivalent of an ignored element (e.g. ignored are clones), reject
    if (equivalentInIgnoredElements(ignoredElements, toCheck)) {
        return NodeFilter.FILTER_REJECT
    }

    // if we're not checking hidden content and the element is hidden, reject
    if (!hiddenContent) {
        if (!elementIsVisible(toCheck as HTMLElement)) {
            return NodeFilter.FILTER_REJECT
        }
    }

    return NodeFilter.FILTER_ACCEPT
}

function nodesUnder(
    document: Document,
    element: Node,
    config: SearchReplaceConfig,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>,
    ignoredElements: Set<Element>
) {
    const nodeType = config.searchTarget === 'innerHTML' ? NodeFilter.SHOW_ELEMENT : NodeFilter.SHOW_TEXT
    let node: Node | null
    const walk = document.createTreeWalker(element, nodeType, {
        acceptNode: (node) => {
            // This doesn't work - child elements aren't removed
            return isIgnored(ignoredElements, node, config.hiddenContent, config.elementFilter)
        },
    })
    const walked = new Set<Node>()

    while ((node = walk.nextNode())) {
        if (walked.has(node)) {
            continue
        }
        walked.add(node)
        const nodeElement = getElementFromNode(node)

        if (nodeElement.tagName === 'WINDOW') {
            continue
        }

        if (!config.hiddenContent && isHidden(nodeElement, false)) {
            continue
        }

        if (config.replace) {
            let oldValue = node['innerHTML']
            if (config.searchTarget === 'innerText') {
                oldValue = node.nodeValue || nodeElement['value']
            }

            if (node && oldValue) {
                // Do the replacement
                const replaceResult = replaceInElement(node as Element, oldValue, config)
                elementsChecked = updateResults(
                    elementsChecked,
                    node as Element,
                    replaceResult.replaced,
                    replaceResult.occurrences,
                    replaceResult.replacementCount
                )
                searchReplaceResult.count.replaced += replaceResult.replacementCount
                searchReplaceResult.replaced = replaceResult.replaced
                element.dispatchEvent(new Event('input', { bubbles: true }))
                node.dispatchEvent(new Event('input', { bubbles: true }))
                if (config.replaceNext && searchReplaceResult.replaced) {
                    config.replace = false
                    break
                }
            }
        } else {
            break
        }
    }

    return { searchReplaceResult, elementsChecked }
}

function replaceInner(
    config: SearchReplaceConfig,
    document: Document,
    originalElement: HTMLElement,
    element: HTMLElement,
    ignoredElements: Set<Element>,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    // continue if there is no inner searchTarget
    if (element[config.searchTarget] === undefined) {
        elementsChecked = updateResults(elementsChecked, element, false, 0, 0)
        return { searchReplaceResult, elementsChecked }
    }

    const occurrences = countOccurrences(element, config)

    elementsChecked = updateResults(elementsChecked, element, false, occurrences, 0)

    const ancestorChecked = containsAncestor(element, elementsChecked)

    if (config.searchTarget === 'innerHTML') {
        // We can reliably add the occurrences as any hidden elements will have been removed from the cloned element
        searchReplaceResult.count.original = searchReplaceResult.count.original + occurrences
    } else if (config.searchTarget === 'innerText') {
        // We have to check if an ancestor has been checked as the innerText of the ancestor will contain the innerText
        // of the element. We also need to check if the element is visible as we will have used textContent in this
        // case, which does contain the hidden text.
        if (!ancestorChecked && !config.hiddenContent) {
            searchReplaceResult.count.original = searchReplaceResult.count.original + occurrences
        } else if (!ancestorChecked && config.hiddenContent) {
            searchReplaceResult.count.original = searchReplaceResult.count.original + occurrences
        }
    }

    // cycle through nodes, replacing in text or the innerHTML
    if (config.replace) {
        const nodesUnderResult = nodesUnder(
            document,
            originalElement,
            config,
            searchReplaceResult,
            elementsChecked,
            ignoredElements
        )

        searchReplaceResult = nodesUnderResult.searchReplaceResult
        elementsChecked = nodesUnderResult.elementsChecked
    }

    // Now replace any inputs
    let inputs = Array.from(originalElement.querySelectorAll('input'))
    // TODO - use the cloned element result to check if the number of elements found in the clone is equal to the number
    //  found in the original element.
    if (!config.hiddenContent) {
        inputs = inputs.filter((input) => elementIsVisible(input, true, true))
    }

    const inputResult = replaceInInputs(config, document, inputs, searchReplaceResult, elementsChecked)

    searchReplaceResult = inputResult.searchReplaceResult
    elementsChecked = inputResult.elementsChecked
    return { searchReplaceResult, elementsChecked }
}

function replaceInInputs(
    config: SearchReplaceConfig,
    document: Document,
    inputs: (HTMLInputElement | HTMLTextAreaElement)[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    for (const input of inputs) {
        const inputResult = replaceInInput(config, document, input, searchReplaceResult, elementsChecked)
        searchReplaceResult = inputResult.searchReplaceResult
        elementsChecked = inputResult.elementsChecked
        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
    }
    return { searchReplaceResult, elementsChecked }
}

function usesKnockout(document: Document): boolean {
    const script = Array.from(document.getElementsByTagName('script')).filter((s) => s.src.indexOf('knockout.js') > -1)
    return script.length > 0
}

function getKnockoutValueChanger(id: string, newValue: string): string {
    // NOTE - even though `id` is a string in the content script, it evaluates to the element on the page. Passing in an
    // element causes this to fail.
    return `(function () {
                var ko = requirejs('ko');
                ko.dataFor(${id}).value('${newValue}');
                ko.dataFor(${id}).valueUpdate = true;
                ko.dataFor(${id}).valueChangedByUser = true;
            })()`
}
// replace in input fields
function replaceInputFields(
    config: SearchReplaceConfig,
    document: Document,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    const allInputs = getInputElements(document, elementsChecked, config.hiddenContent)
    // add inputs to elementsChecked
    allInputs.map((input) => elementsChecked.set(input, newSearchReplaceCount()))
    const inputsResult = replaceInInputs(config, document, allInputs, searchReplaceResult, elementsChecked)
    searchReplaceResult = inputsResult.searchReplaceResult
    elementsChecked = inputsResult.elementsChecked
    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
    }
    return { searchReplaceResult, elementsChecked }
}

function getHiddenElements(element: HTMLElement, config: SearchReplaceConfig): Set<Element> {
    return new Set(
        Array.from(element.getElementsByTagName('*'))
            .filter((el) => !el.tagName.match(config.elementFilter))
            .filter((el) => !elementIsVisible(el as HTMLElement, false, false))
    )
}

function equivalentInIgnoredElements(ignoredElements: Set<Element>, element: Element) {
    for (const ignored of ignoredElements) {
        if (ignored.isEqualNode(element)) {
            return true
        }
    }

    return false
}

function replaceInHTML(
    config: SearchReplaceConfig,
    document: Document,
    originalElements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    for (const [originalIndex, originalElement] of originalElements.entries()) {
        let clonedElement = originalElement.cloneNode(true) as HTMLElement

        const { clonedElementRemoved, removedSet } = copyElementAndRemoveSelectedElements(
            clonedElement,
            // Remove elements that match the filter and are not blob iframes. Removes SCRIPT, STYLE, IFRAME, etc.
            (el: HTMLElement) => !!el.nodeName.match(config.elementFilter) && !isBlobIframe(el),
            false
        )
        clonedElement = clonedElementRemoved as HTMLElement
        let ignoredElements = removedSet
        if (!config.hiddenContent) {
            // We have to check the visibility of the original elements as the cloned ones are all invisible
            if (!elementIsVisible(originalElements[originalIndex])) {
                continue
            }
            ignoredElements = new Set([
                ...ignoredElements,
                ...(getHiddenElements(originalElement, config) as Set<HTMLElement>),
            ])
            // the above works if an ancestor of the element is hidden, but not if the element contains descendants that
            // are hidden. To check for this, we need to check the relatives of the element to see if they are hidden
            // and if so, create a copy of the element with the hidden elements removed, storing a map of the hidden
            // elements and their paths, so we can ignore them during replacement
            const { clonedElementRemoved, removedSet } = copyElementAndRemoveSelectedElements(
                clonedElement,
                (el) => equivalentInIgnoredElements(ignoredElements, el),
                false
            )

            clonedElement = clonedElementRemoved as HTMLElement
            ignoredElements = new Set([...ignoredElements, ...removedSet])
            console.log(
                "Ignored elements after removing hidden elements from the element's descendants",
                ignoredElements
            )
        }

        // replace inner texts first, dropping out if we have done a replacement and are not working globally
        const innerResult = replaceInner(
            config,
            document,
            originalElement,
            clonedElement,
            ignoredElements,
            searchReplaceResult,
            elementsChecked
        )

        searchReplaceResult = innerResult.searchReplaceResult
        elementsChecked = innerResult.elementsChecked

        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
    }

    return { searchReplaceResult, elementsChecked }
}
function replaceNextOnly(flags: string): boolean {
    return flags.indexOf(RegexFlags.Global) === -1
}

export async function searchReplace(
    action: SearchReplaceActions,
    window: Window,
    searchTerm: string,
    replaceTerm: string,
    inputFieldsOnly: boolean,
    isRegex: boolean,
    hiddenContent: boolean,
    wholeWord: boolean,
    matchCase: boolean,
    replaceHTML: boolean,
    replaceAll: boolean,
    isIframe: boolean,
    iframes: HTMLIFrameElement[],
    elementFilter: RegExp
): Promise<ReplaceFunctionReturnType> {
    const searchReplaceResult: SearchReplaceResult = {
        count: { original: Number(0), replaced: Number(0) },
        replaced: false,
    }
    const elementsChecked = new Map<Element, SearchReplaceResult>()
    const document = window.document
    const flags = getFlags(matchCase, replaceAll)
    // We only replace if this is true, otherwise we count the number of occurrences
    const replace = action === 'searchReplace'
    const replaceNext = replaceNextOnly(flags)
    const searchPattern = getSearchPattern(searchTerm, isRegex, flags, wholeWord)
    const globalFlags = getFlags(matchCase, true)
    const globalSearchPattern = getSearchPattern(searchTerm, isRegex, globalFlags, wholeWord)
    const searchTarget = replaceHTML ? 'innerHTML' : 'innerText'
    const config: SearchReplaceConfig = {
        action,
        replace,
        replaceNext: replaceNext,
        replaceAll: !replaceNext,
        searchTerm,
        replaceTerm,
        flags,
        inputFieldsOnly,
        isRegex,
        replaceHTML,
        hiddenContent,
        wholeWord,
        searchPattern,
        globalSearchPattern,
        matchCase,
        isIframe,
        iframes,
        elementFilter,
        usesKnockout: usesKnockout(window.document),
        searchTarget,
    }

    // we check other places if text was not replaced in a text editor
    let result: ReplaceFunctionReturnType
    if (inputFieldsOnly) {
        result = replaceInputFields(config, document, searchReplaceResult, elementsChecked)
        if (config.replaceNext && result.searchReplaceResult.replaced) {
            config.replace = false
        }
    } else {
        const startingElement = document.body || document.querySelector('div')
        const searchableIframePromises: Promise<HTMLElement | null>[] = getIframeElements(document, true).map(
            (iframe) => {
                return new Promise((resolve, reject) => {
                    if (iframe.contentDocument) {
                        if (iframe.contentDocument.readyState !== 'complete') {
                            iframe.contentDocument.onreadystatechange = () => {
                                if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                                    const element = getInitialIframeElement(iframe)
                                    resolve(element)
                                }
                            }
                        } else {
                            resolve(getInitialIframeElement(iframe))
                        }
                    }
                })
            }
        )
        const searchableIframes = (await Promise.all(searchableIframePromises)).filter(notEmpty)

        result = replaceInHTML(
            config,
            document,
            [startingElement, ...searchableIframes],
            searchReplaceResult,
            elementsChecked
        )
    }

    return result
}

if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg: SearchReplaceContentMessage, sender, sendResponse) {
        const instance = msg.instance
        const replaceAll = msg.action === 'count' ? true : instance.options.replaceAll
        const action = msg.action
        // are we in an iframe?
        const isIframe = inIframe()
        // get all iframes
        const iframes = getIframeElements(window.document)

        // Setup event listeners to communicate between iframes and parent
        searchReplace(
            action,
            window,
            instance.searchTerm,
            instance.replaceTerm,
            instance.options.inputFieldsOnly,
            instance.options.isRegex,
            instance.options.hiddenContent,
            instance.options.wholeWord,
            instance.options.matchCase,
            instance.options.replaceHTML,
            replaceAll,
            isIframe,
            iframes,
            ELEMENT_FILTER
        ).then((result) => {
            const response: SearchReplaceResponse = {
                inIframe: inIframe(),
                result: result.searchReplaceResult,
                location: window.location.toString(),
                action: 'searchReplaceResponseBackground',
                hints: getHints(document),
                iframes: iframes.length,
                instance: instance,
                backgroundReceived: 0,
                host: window.location.host,
            }

            // Send the response to the background script for processing
            chrome.runtime.sendMessage(response).then((r) => {
                sendResponse({
                    action: 'searchReplaceResponsePopup',
                    msg: `Content script sent message to background with response ${r}`,
                })
            })
            return true
        })
    })
}
