'use strict'

import { ELEMENT_FILTER, INPUT_TEXTAREA_FILTER, RICH_TEXT_EDITORS } from './constants'
import {
    RegexFlags, ReplaceFunctionReturnType,
    RichTextEditor,
    SearchReplaceActions,
    SearchReplaceConfig,
    SearchReplaceContentMessage,
    SearchReplaceResponse,
    SearchReplaceResult,
} from './types/index'
import {checkIframeHosts, elementIsVisible, getIframeElements, getInputElements, inIframe} from './util'
import { getFlags, getSearchPattern } from './regex'
import { getHints } from './hints'

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
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    if (input.value !== undefined) {
        const oldValue = input.value
        const occurrences = oldValue.match(config.searchPattern)
        if (occurrences) {
            console.log("CONTENT: occurrences in replaceInInput", occurrences, input)
            searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
            const newValue = input.value.replace(config.searchPattern, config.replaceTerm)

            if (config.replace && oldValue !== newValue) {
                input.focus()
                setNativeValue(input, newValue)
                const replaceCount = config.replaceAll ? occurrences.length : 1
                console.log("CONTENT: adding", replaceCount, "to replaced count")
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
    return searchReplaceResult
}

function replaceInnerText(
    config: SearchReplaceConfig,
    document: Document,
    elements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, Element> = new Map<Element, Element>()
): ReplaceFunctionReturnType {
    for (const element of elements) {
        if (element.innerText !== undefined) {

            const occurrences = element.innerText.match(config.globalSearchPattern)
            if (occurrences) {
                elementsChecked.set(element, element)

                if (element.parentElement && !elementsChecked.has(element.parentElement)) {
                    console.log("CONTENT: checking element", element)

                    const textNodesResult = replaceInTextNodes(config, document, element, searchReplaceResult, elementsChecked)
                    searchReplaceResult = textNodesResult.searchReplaceResult
                    elementsChecked = textNodesResult.elementsChecked
                    if (config.replaceNext && searchReplaceResult.replaced) {
                        console.log("CONTENT: stopping replace as replaceNext set and we've already replaced")
                        config.replace = false
                    }
                }
            }
        }
    }
    return {searchReplaceResult, elementsChecked}
}

function replaceInTextNodes(
    config: SearchReplaceConfig,
    document: Document,
    element: HTMLElement,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, Element> = new Map<Element, Element>()
):ReplaceFunctionReturnType {
    const textNodes = textNodesUnder(document, element, config.elementFilter)
    console.log("textNodes", textNodes)
    // Given the map of text nodes contained under the element, replace the text in each node.
    // Stop replacing if the element containing the text node has already been checked as part of a parent element
    for (const textNode of textNodes.values()) {
        if (textNode.nodeValue !==null) {
            const oldValue = textNode.nodeValue
            const occurrences = oldValue.match(config.searchPattern)

            if (occurrences) {
                console.log("CONTENT: occurrences in replaceInTextNodes", occurrences)
                if(textNode.parentElement) {
                    elementsChecked.set(textNode.parentElement, textNode.parentElement)
                }
                console.log(textNode, textNode.parentElement)
                searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
                const newValue = oldValue.replace(config.searchPattern, config.replaceTerm)

                if (config.replace && oldValue !== newValue) {
                    textNode.nodeValue = newValue
                    console.log("oldValue", oldValue, "newValue", newValue)
                    const replacementCount =  config.replaceAll ? occurrences.length : 1
                    console.log("CONTENT: adding", replacementCount, "to replaced count")
                    searchReplaceResult.count.replaced += replacementCount // adds one to replaced count if a replacement was made, adds occurrences if a global replace is made
                    searchReplaceResult.replaced = true
                    textNode.dispatchEvent(new Event('input', {bubbles: true}))
                }
            }
        }
    }

    return {searchReplaceResult, elementsChecked}
}

function textNodesUnder(document: Document, element: Node, elementFilter: RegExp) {
    let node: Node | null
    const nodes =  new Map<Node, Node>()
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
    while ((node = walk.nextNode())) {
        if (node && (node.nodeValue && !node.nodeName.match(elementFilter))) {
            if (node.nextSibling && node.nextSibling.nodeName.match(elementFilter)) {
                continue
            }
            if(node.previousSibling && node.previousSibling.nodeName.match(elementFilter)) {
                console.log("CONTENT: continuing for previous sibling",  node.previousSibling.nodeName)
                continue
            }

            nodes.set(node, node)
        }
    }
    return nodes
}


function replaceInInputs(
    config: SearchReplaceConfig,
    document: Document,
    inputs: (HTMLInputElement | HTMLTextAreaElement)[],
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    for (const input of inputs) {
        searchReplaceResult = replaceInInput(config, document, input, searchReplaceResult)
        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
    }
    return searchReplaceResult
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

function replaceInputFields(
    config: SearchReplaceConfig,
    document: Document,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, Element> = new Map<Element, Element>()
): ReplaceFunctionReturnType {
    const allInputs = getInputElements(document, config.visibleOnly, elementsChecked)
    // add inputs to elementsChecked
    allInputs.map((input) => elementsChecked.set(input, input))
    searchReplaceResult = replaceInInputs(config, document, allInputs, searchReplaceResult)
    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
    }
    return {searchReplaceResult, elementsChecked}
}

function getFilteredElements(document: Document, elementFilter: RegExp) {
    const otherElements = document.body.getElementsByTagName('*')
    console.log(otherElements)
    const otherElementsArr: HTMLElement[] = Array.from(otherElements).filter(
        (el) => !el.tagName.match(elementFilter)
    ) as HTMLElement[]
    console.log(elementFilter)
    console.log(otherElementsArr)
    return otherElementsArr
}

function replaceHTML(
    config: SearchReplaceConfig,
    document: Document,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, Element> = new Map<Element, Element>()
): ReplaceFunctionReturnType {
    let otherElementsArr = getFilteredElements(document, config.elementFilter).filter((el) => !elementsChecked.has(el))
    if (config.visibleOnly) {
        otherElementsArr = otherElementsArr.filter(elementIsVisible)
    }
    const visibleOnlyResult = replaceInElements(config, document, otherElementsArr, searchReplaceResult, elementsChecked)
    searchReplaceResult = visibleOnlyResult.searchReplaceResult
    elementsChecked = visibleOnlyResult.elementsChecked
    console.log('CONTENT: searchReplaceResult after replaceVisibleOnly', JSON.stringify(searchReplaceResult))

    return {searchReplaceResult, elementsChecked}
}
function replaceNextOnly(flags: string): boolean {
    return flags.indexOf(RegexFlags.Global) === -1
}

function replaceInElements(
    config: SearchReplaceConfig,
    document: Document,
    elements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, Element>
): ReplaceFunctionReturnType {
    // get unhidden, unchecked elements
    console.log('CONTENT: unhidden elements', elements)
    // replace inner texts first, dropping out if we have done a replacement and are not working globally
    const innerTextResult = replaceInnerText(config, document, elements, searchReplaceResult, elementsChecked)
    searchReplaceResult = innerTextResult.searchReplaceResult
    elementsChecked = innerTextResult.elementsChecked
    console.log('CONTENT: searchReplaceResult after replaceInnerText', JSON.stringify(searchReplaceResult))
    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
    }
    // then replace inputs
    const inputs: HTMLInputElement[] = elements.filter((el) =>
        el.tagName.match(INPUT_TEXTAREA_FILTER)
    ) as HTMLInputElement[]
    // remove checked elements from inputs
    console.log("CONTENT: inputs", inputs)
    console.log("CONTENT: elementsChecked", elementsChecked)
    const inputsToCheck = inputs.filter((input) => !elementsChecked.has(input))
    inputsToCheck.map((input) => elementsChecked.set(input, input))
    searchReplaceResult = replaceInInputs(config, document, inputsToCheck, searchReplaceResult)
    console.log('CONTENT: searchReplaceResult after replaceInInputs', JSON.stringify(searchReplaceResult))
    return {searchReplaceResult, elementsChecked}
}

// Custom Functions

async function replaceInEditorContainers(
    config: SearchReplaceConfig,
    richTextEditor: RichTextEditor,
    containers: (Element | Document)[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, Element> = new Map<Element, Element>()
): Promise<ReplaceFunctionReturnType> {
    try {
        // Loop to select editor elements inside their containers
        for (const containerOuter of containers) {
            let container = containerOuter

            if ('contentDocument' in containerOuter && containerOuter.contentDocument !== null) {
                // container is an iframe use its contentDocument
                container = <Document>containerOuter.contentDocument
            } else if (
                richTextEditor.container &&
                richTextEditor.container.iframe &&
                'tagName' in containerOuter &&
                containerOuter?.tagName !== 'IFRAME'
            ) {
                // container contains an iframe so use that iframe and its contentDocument
                const innerIframe = containerOuter?.querySelector('iframe')
                if (innerIframe !== null && innerIframe.contentDocument !== null) {
                    container = innerIframe.contentDocument
                }
            }

            const editors = Array.from(container.querySelectorAll(richTextEditor.editor.value.join(',')) || [])
            const editorResult = await replaceInEditors(config, editors, searchReplaceResult, elementsChecked)
            searchReplaceResult = editorResult.searchReplaceResult
            elementsChecked = editorResult.elementsChecked
            if (config.replaceNext && editorResult.searchReplaceResult) {
                config.replace = false
            }
        }
    } catch (err) {
        console.error(err)
        return {searchReplaceResult, elementsChecked}
    }

    return {searchReplaceResult, elementsChecked}
}

async function replaceInEditors(
    config: SearchReplaceConfig,
    editors: Element[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, Element> = new Map<Element, Element>()
): Promise<ReplaceFunctionReturnType> {
    for (const editor of editors) {
        elementsChecked.set(editor, editor)
        searchReplaceResult = replaceInInnerHTML(config, editor as HTMLElement, searchReplaceResult)

        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
    }
    return {searchReplaceResult, elementsChecked}
}

function replaceInInnerHTML(
    config: SearchReplaceConfig,
    element: HTMLElement | Element,
    searchReplaceResult: SearchReplaceResult,
): SearchReplaceResult {
    // take a copy of the element except with iframes removed from within
    const elementCopy = element.cloneNode(true) as HTMLElement
    const iframes = Array.from(elementCopy.getElementsByTagName('iframe'))
    iframes.forEach((iframe) => iframe.parentNode?.removeChild( iframe ))
    console.log("elementCopy", elementCopy.innerHTML)
    let oldValue = element.innerHTML
    const occurrences = elementCopy.innerHTML.match(config.searchPattern)
    console.log("occurrences in replaceInInnerHTML", occurrences)
    if (occurrences) {
        searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
        // select the content editable area
        console.log("focusing element", element)
        element.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
        let newValue = oldValue
        let selector = 'innerHTML'
        if ('innerText' in element && element.innerText === element.innerHTML) {
            oldValue = getTextContent(element)
            newValue = oldValue
            selector = 'textContent'
        }
        newValue = oldValue.replace(config.searchPattern, config.replaceTerm)

        if (oldValue != newValue && config.replace) {
            element[selector] = newValue
            element.innerHTML = newValue
            const replaceCount = config.replaceAll ? occurrences.length : 1
            console.log("CONTENT: adding", replaceCount, "to replaced count")
            searchReplaceResult.count.replaced += replaceCount
            searchReplaceResult.replaced = true
            console.log("inputting element", element)
            element.dispatchEvent(new Event('input', { bubbles: true }))
        }
    }
    return searchReplaceResult
}

function getTextContent(element: HTMLElement | Element): string {
    if (element.textContent) {
        return element.textContent
    } else if ('innerText' in element && element.innerText) {
        return element.innerText
    }
    return ''
}

async function replaceInCMSEditors(
    config: SearchReplaceConfig,
    document: Document,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, Element> = new Map<Element, Element>()
): Promise<ReplaceFunctionReturnType> {
    // replacement functions for pages with text editors
    for (const richTextEditor of RICH_TEXT_EDITORS) {
        if (richTextEditor.container) {
            const containers = Array.from(document.querySelectorAll(richTextEditor.container.value.join(',')))
            if (containers.length) {
                console.log("CONTENT: Found containers", containers)
                const containerResult = await replaceInEditorContainers(
                    config,
                    richTextEditor,
                    containers,
                    searchReplaceResult,
                    elementsChecked
                )
                searchReplaceResult = containerResult.searchReplaceResult
                elementsChecked = containerResult.elementsChecked
                if (config.replaceNext && searchReplaceResult.replaced) {
                    config.replace = false
                }
            }
        } else {
            const editors = Array.from(document.querySelectorAll(richTextEditor.editor.value.join(',')))
            const editorsResult = await replaceInEditors(config, editors, searchReplaceResult, elementsChecked)
            searchReplaceResult = editorsResult.searchReplaceResult
            elementsChecked = editorsResult.elementsChecked
            document.body.dispatchEvent(new Event('input', { bubbles: true }))
            if (config.replaceNext && searchReplaceResult.replaced) {
                config.replace = false
            }
        }
    }

    return {searchReplaceResult, elementsChecked}
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
    replaceAll: boolean,
    isIframe: boolean,
    iframes: HTMLIFrameElement[],
    iframesOnDifferentHosts: boolean,
    elementFilter: RegExp
): Promise<SearchReplaceResult> {
    const searchReplaceResult: SearchReplaceResult = {
        count: { original: Number(0), replaced: Number(0) },
        replaced: false,
    }
    console.log('CONTENT: searchReplaceResult initially', JSON.stringify(searchReplaceResult))
    const document = window.document
    const flags = getFlags(matchCase, replaceAll)
    // We only replace if this is true, otherwise we count the number of occurrences
    const replace = action === 'searchReplace'
    const replaceNext = replaceNextOnly(flags)
    if (searchReplaceResult.count.original !== 0) {
        throw new Error('SearchReplaceResult count.original should be 0')
    }
    const searchPattern = getSearchPattern(searchTerm, isRegex, flags, wholeWord)
    const globalFlags = getFlags(matchCase, true)
    const globalSearchPattern = getSearchPattern(searchTerm, isRegex, globalFlags, wholeWord)
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
        visibleOnly,
        wholeWord,
        searchPattern,
        globalSearchPattern,
        matchCase,
        isIframe,
        iframes,
        iframesOnDifferentHosts,
        elementFilter,
        usesKnockout: usesKnockout(window.document),
    }
    // Only search iframes if they are on the same host

    console.log('CONTENT: Searching document', document)
    // replacement functions for pages with text editors
    let result = await replaceInCMSEditors(config, document, searchReplaceResult)
    console.log('CONTENT: searchReplaceResult after CMS Editors', JSON.stringify(result.searchReplaceResult))
    if (config.replaceNext && result.searchReplaceResult.replaced) {
        console.log('CONTENT: setting replace to false')
        config.replace = false
    }

    // we check other places if text was not replaced in a text editor
    console.log("CONTENT: replaced", result.searchReplaceResult.replaced, "config.replaceAll", config.replaceAll)
    if (!result.searchReplaceResult.replaced || (config.replaceAll && result.searchReplaceResult.replaced)) {
        if (inputFieldsOnly) {
            result = replaceInputFields(config, document, result.searchReplaceResult)
            if (config.replaceNext && result.searchReplaceResult.replaced) {
                config.replace = false
            }
            console.log(
                'CONTENT: searchReplaceResult after replaceInputFields',
                JSON.stringify(result.searchReplaceResult)
            )
        } else {
            result = replaceHTML(config, document, result.searchReplaceResult)

            console.log('CONTENT: searchReplaceResult after replaceHTML', JSON.stringify(result.searchReplaceResult))
        }
    }

    return result.searchReplaceResult
}

if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg: SearchReplaceContentMessage, sender, sendResponse) {
        console.log('CONTENT: received message with action', msg.action)
        const instance = msg.instance
        const replaceAll = msg.action === 'count' ? true : instance.options.replaceAll
        const action = msg.action
        // are we in an iframe?
        const isIframe = inIframe()
        // get all iframes
        const iframes = getIframeElements(window.document)
        // are the iframes on different hosts?
        const iframeOnDifferentHosts = checkIframeHosts(iframes)
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
            replaceAll,
            isIframe,
            iframes,
            iframeOnDifferentHosts,
            ELEMENT_FILTER
        ).then((result) => {
            const response: SearchReplaceResponse = {
                inIframe: inIframe(),
                result: result,
                location: window.location.toString(),
                action: 'searchReplaceResponseBackground',
                hints: getHints(document),
                iframes: iframes.length,
                instance: instance,
                backgroundReceived: 0,
                host: window.location.host,
            }
            console.log('\nCONTENT: sending response to background', JSON.stringify(response))
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
