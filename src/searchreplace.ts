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
    getInputElements,
    inIframe,
} from './elements'
import { getFlags, getSearchPattern } from './regex'
import { getHints } from './hints'

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
        console.log('Setting input value: prototypeValueSetter', value)
        prototypeValueSetter.call(element, value)
    } else if (valueSetter) {
        console.log('Setting input value: valueSetter', value)
        valueSetter.call(element, value)
    } else {
        console.log('Setting input value', value)
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
            console.log('input', input, 'oldValue', oldValue, 'newValue', newValue, 'Config,replace', config.replace)
            if (config.replace && oldValue !== newValue) {
                input.focus()
                setNativeValue(input, newValue)
                const replaceCount = config.replaceAll ? occurrences.length : 1
                elementsChecked = updateResults(elementsChecked, input, true, occurrences.length, replaceCount)

                searchReplaceResult.count.replaced += replaceCount
                searchReplaceResult.replaced = true

                if (config.usesKnockout) {
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
    console.log('Searching', el[config.searchTarget])
    const matches = el[config.searchTarget].match(config.globalSearchPattern) || []
    return matches.length
}

function replaceInElement(node: Element, oldValue: string, config: SearchReplaceConfig) {
    const occurrences = oldValue.match(config.globalSearchPattern) || []
    let replacementCount = 0
    let replace = false
    let replaced = false
    if (occurrences) {
        const newValue = oldValue.replace(config.searchPattern, config.replaceTerm)
        replace = oldValue != newValue
        if (replace) {
            replacementCount = config.replaceAll ? occurrences.length : 1 // adds one to replaced count if a replacement was made, adds occurrences if a global replace is made
            const nodeElement = getElementFromNode(node)
            console.log('Replacing in element', nodeElement, oldValue, newValue)
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

function isIgnored(ignoredElements: Set<Element>, node: Node, visibleOnly: boolean): number {
    const toCheck = getElementFromNode(node)
    if (toCheck.tagName.match(ELEMENT_FILTER)) {
        console.log('Filter Rejecting', toCheck, 'via element filter')
        return NodeFilter.FILTER_REJECT
    }

    if (ignoredElements.has(toCheck)) {
        console.log('Filter Rejecting', toCheck, 'via ignoredElements set')
        return NodeFilter.FILTER_REJECT
    }

    const found = Array.from(ignoredElements.values()).filter((element) => element.isEqualNode(toCheck))
    if (found.length) {
        console.log('Filter Rejecting', toCheck, 'via ignoredElements element check')
        return NodeFilter.FILTER_REJECT
    }

    if (visibleOnly) {
        if (!elementIsVisible(toCheck as HTMLElement)) {
            console.log('Filter Rejecting', toCheck, 'via visibleOnly')
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
    console.log('Config.searchTarget', config.searchTarget, 'config', config)
    const nodeType = config.searchTarget === 'innerHTML' ? NodeFilter.SHOW_ELEMENT : NodeFilter.SHOW_TEXT
    let node: Node | null
    const walk = document.createTreeWalker(element, nodeType, {
        acceptNode: (node) => {
            return isIgnored(ignoredElements, node, config.visibleOnly)
        },
    })

    console.log('ignored element paths', ignoredElements, ignoredElements.keys())
    while ((node = walk.nextNode())) {
        // Don't replace in iframes
        if (node.nextSibling && node.nextSibling.nodeName.match(ELEMENT_FILTER)) {
            continue
        }
        // TODO config.replace won't change as long as we're saving the replacements for later
        if (config.replace) {
            let oldValue = node['innerHTML']
            if (config.searchTarget === 'innerText') {
                console.log('node', getElementFromNode(node), 'node.nodeValue', node.nodeValue)
                oldValue = node.nodeValue || getElementFromNode(node)['value']
            }
            console.log('node', node, 'OldValue', oldValue)
            if (node && oldValue && !node.nodeName.match(ELEMENT_FILTER)) {
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
                    console.log('Breaking as replaced')
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
    originalElements: HTMLElement[],
    elements: HTMLElement[],
    ignoredElements: Set<Element>,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    for (const [index, element] of elements.entries()) {
        console.log('Checking', element)
        // continue if there is no inner text
        if (element[config.searchTarget] === undefined) {
            console.log("Element doesn't have ", config.searchTarget, 'property')
            continue
        }
        const occurrences = countOccurrences(element, config)
        console.log('Occurrences', occurrences)

        const ancestorChecked = containsAncestor(element, elementsChecked)
        elementsChecked = updateResults(elementsChecked, element, false, occurrences, 0)
        console.log("Element's ancestor checked", ancestorChecked)

        searchReplaceResult.count.original =
            ancestorChecked && elementIsVisible(element)
                ? searchReplaceResult.count.original
                : searchReplaceResult.count.original + occurrences

        // cycle through nodes, replacing in text or the innerHTML
        if (config.replace) {
            const nodesUnderResult = nodesUnder(
                document,
                originalElements[index],
                config,
                searchReplaceResult,
                elementsChecked,
                ignoredElements
            )
            console.log('nodesUnderResult', JSON.stringify(nodesUnderResult, null, 4))
            searchReplaceResult = nodesUnderResult.searchReplaceResult
            elementsChecked = nodesUnderResult.elementsChecked
        }

        // Now replace any inputs
        let inputs = Array.from(originalElements[index].querySelectorAll('input'))
        // TODO - use the cloned element result to check if the number of elements found in the clone is equal to the number
        //  found in the original element.
        if (config.visibleOnly) {
            inputs = inputs.filter((input) => elementIsVisible(input))
        }
        console.log('replacing in inputs', inputs)
        const inputResult = replaceInInputs(config, document, inputs, searchReplaceResult, elementsChecked)
        console.log('inputResult', JSON.stringify(inputResult, null, 4))
        searchReplaceResult = inputResult.searchReplaceResult
        elementsChecked = inputResult.elementsChecked
    }
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
    const allInputs = getInputElements(document, elementsChecked, config.visibleOnly)
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

function replaceInHTML(
    config: SearchReplaceConfig,
    document: Document,
    originalElements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    let clonedElements = originalElements.map((el) => el.cloneNode(true) as HTMLElement)
    let ignoredElements = new Set<Element>()
    if (config.visibleOnly) {
        // We have to check the visibility of the original elements as the cloned ones are all invisible
        clonedElements = clonedElements.filter((_el, index) => elementIsVisible(originalElements[index]))
        // the above works if an ancestor of the element is hidden, but not if the element contains descendants that
        // are hidden. To check for this, we need to check the relatives of the element to see if they are hidden
        // and if so, create a copy of the element with the hidden elements removed, storing a map of the hidden
        // elements and their paths, so we can ignore them during replacement
        clonedElements = clonedElements.map((element) => {
            // TODO is there an additional copy that can be removed here?
            const { elementCopy, removedSet } = copyElementAndRemoveSelectedElements(
                element,
                // Tell it to remove elements that are not visible
                (el: HTMLElement) => !elementIsVisible(el, true, true)
            )
            ignoredElements = removedSet
            return elementCopy as HTMLElement
        })
    }
    console.log('ignoredElements', ignoredElements)
    console.log('clonedElements', clonedElements)
    console.log('originalElements', originalElements)
    // replace inner texts first, dropping out if we have done a replacement and are not working globally
    const innerResult = replaceInner(
        config,
        document,
        originalElements,
        clonedElements,
        ignoredElements,
        searchReplaceResult,
        elementsChecked
    )

    searchReplaceResult = innerResult.searchReplaceResult
    elementsChecked = innerResult.elementsChecked

    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
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
    visibleOnly: boolean,
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
        visibleOnly,
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
        result = replaceInHTML(config, document, [startingElement], searchReplaceResult, elementsChecked)
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
            instance.options.visibleOnly,
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
