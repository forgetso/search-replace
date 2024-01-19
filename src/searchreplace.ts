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
    restoreRemovedElements,
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
    let valueSetter: ((v: any) => void) | undefined
    let prototypeValueSetter: ((v: any) => void) | undefined
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
    const matches = el[config.searchTarget].match(config.globalSearchPattern) || []
    return matches.length
}

function replaceInElement(node: Element, oldValue: string, config: SearchReplaceConfig) {
    const occurrences = oldValue.match(config.globalSearchPattern) || []
    const newValue = oldValue.replace(config.searchPattern, config.replaceTerm)
    let replacementCount = 0
    if (oldValue != newValue) {
        replacementCount = config.replaceAll ? occurrences.length : 1 // adds one to replaced count if a replacement was made, adds occurrences if a global replace is made

        if ('value' in node) {
            // TODO unify with replaceInInput, taking care not to count occurrences again
            node['value'] = newValue
        }
        if (config.searchTarget === 'innerHTML') {
            node[config.searchTarget] = newValue
        } else if (node.nodeValue) {
            node.nodeValue = newValue
        }
    }
    return { node, occurrences: occurrences.length, replacementCount }
}

function nodesUnder(
    document: Document,
    element: Node,
    config: SearchReplaceConfig,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
) {
    const filter = config.searchTarget === 'innerHTML' ? NodeFilter.SHOW_ELEMENT : NodeFilter.SHOW_TEXT
    let node: Node | null
    const walk = document.createTreeWalker(element, filter, null)
    while ((node = walk.nextNode())) {
        // Don't replace in iframes
        if (node.nextSibling && node.nextSibling.nodeName.match(ELEMENT_FILTER)) {
            continue
        }
        if (config.replace) {
            let oldValue = node['innerHTML']
            if (config.searchTarget === 'innerText') {
                oldValue = node.nodeValue || node['value']
            }
            if (node && oldValue && !node.nodeName.match(ELEMENT_FILTER)) {
                console.log(node.nodeValue, node.nodeName)
                const replaceResult = replaceInElement(node as Element, oldValue, config)
                node = replaceResult.node
                elementsChecked = updateResults(
                    elementsChecked,
                    node as Element,
                    true,
                    replaceResult.occurrences,
                    replaceResult.replacementCount
                )
                searchReplaceResult.count.replaced += replaceResult.replacementCount
                searchReplaceResult.replaced = true
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
    elements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    for (const element of elements) {
        console.log('Checking', element)
        // continue if there is no inner text
        if (element[config.searchTarget] === undefined) {
            continue
        }
        const occurrences = countOccurrences(element, config)
        // continue if there are no occurrences
        if (!occurrences) {
            continue
        }

        const nodeValue = element.childNodes[0].nodeValue
        const nodeType = element.childNodes[0].nodeType

        // continue if there is no node value or the node is not a text type
        if (!nodeValue || !(nodeType === 3)) {
            continue
        }

        const ancestorChecked = containsAncestor(element, elementsChecked)
        elementsChecked = updateResults(elementsChecked, element, false, occurrences, 0)

        searchReplaceResult.count.original =
            ancestorChecked && elementIsVisible(element)
                ? searchReplaceResult.count.original
                : searchReplaceResult.count.original + occurrences

        // cycle through nodes, replacing in text or the innerHTML
        if (config.replace) {
            const nodesUnderResult = nodesUnder(document, element, config, searchReplaceResult, elementsChecked)
            searchReplaceResult = nodesUnderResult.searchReplaceResult
            elementsChecked = nodesUnderResult.elementsChecked
        }

        // Now replace any inputs
        let inputs = Array.from(element.querySelectorAll('input'))

        // TODO - check. this should've been taken care of by the hidden filter earlier on
        if (config.visibleOnly) {
            inputs = inputs.filter((input) => elementIsVisible(input))
        }
        const inputResult = replaceInInputs(config, document, inputs, searchReplaceResult, elementsChecked)
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
    originalElementsArr: HTMLElement[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    let otherElementsArr = originalElementsArr.map((el) => el.cloneNode(true) as HTMLElement)
    const hiddenElementPaths: Map<Element, number[]>[] = []
    if (config.visibleOnly) {
        otherElementsArr = otherElementsArr.filter((el) => elementIsVisible(el))
        // the above works if an ancestor of the element is hidden, but not if the element contains descendants that
        // are hidden. To check for this, we need to check the descendants of the element to see if they are hidden
        // and if so, create a copy of the element with the hidden elements removed, storing a map of the hidden
        // elements and their paths so we can restore them later.
        otherElementsArr = otherElementsArr.map((element) => {
            // TODO is there an additional copy that can be removed here?
            const { elementCopy, removedMap } = copyElementAndRemoveSelectedElements(element, elementIsVisible, [true])
            hiddenElementPaths.push(removedMap)
            return elementCopy as HTMLElement
        })
    }
    // replace inner texts first, dropping out if we have done a replacement and are not working globally
    const innerResult = replaceInner(config, document, otherElementsArr, searchReplaceResult, elementsChecked)

    searchReplaceResult = innerResult.searchReplaceResult
    elementsChecked = innerResult.elementsChecked

    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
    }

    if (hiddenElementPaths.length) {
        // restore hidden elements
        otherElementsArr.map((element, index) => {
            return restoreRemovedElements(element, hiddenElementPaths[index]) as HTMLElement
        })
    }
    // update the results with the modified elements
    if (config.replace) {
        originalElementsArr.map((element, index) => {
            console.log('Replacing with', otherElementsArr[index])
            element.replaceWith(otherElementsArr[index])
        })
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
