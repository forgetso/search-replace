'use strict'

import { ELEMENT_FILTER, INPUT_TEXTAREA_FILTER, RICH_TEXT_EDITORS } from './constants'
import {
    RegexFlags,
    RichTextEditor,
    SearchReplaceActions,
    SearchReplaceConfig,
    SearchReplaceContentMessage,
    SearchReplaceResponse,
    SearchReplaceResult,
} from './types/index'
import { checkIframeHosts, elementIsVisible, getIframeElements, getInputElements, inIframe, notEmpty } from './util'
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
            searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
            const newValue = input.value.replace(config.searchPattern, config.replaceTerm)

            if (config.replace && oldValue !== newValue) {
                input.focus()
                setNativeValue(input, newValue)
                searchReplaceResult.count.replaced++
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
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    const elementsChecked = new Map<Element, Element>
    for (const element of elements) {
        if (element.innerText !== undefined) {

            const occurrences = element.innerText.match(config.globalSearchPattern)
            //console.log("CONTENT: occurrences", occurrences, config.globalSearchPattern, config.searchPattern)
            if (occurrences) {
                elementsChecked.set(element, element)

                if (element.parentElement && !elementsChecked.has(element.parentElement)) {
                    console.log("CONTENT: checking element", element)
                    searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
                    if (config.replace) {
                        console.log('CONTENT: continuing replace as replace set')

                        const textNodesResult = replaceInTextNodes(config, document, element, searchReplaceResult, elementsChecked)
                        searchReplaceResult = textNodesResult.searchReplaceResult

                    }
                    if (config.replaceNext && searchReplaceResult.replaced) {
                        console.log("CONTENT: stopping replace as replaceNext set and we've already replaced")
                        config.replace = false
                    }
                }
            }
        }
    }
    return searchReplaceResult
}

function replaceInTextNodes(
    config: SearchReplaceConfig,
    document: Document,
    element: HTMLElement,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, Element>
): {searchReplaceResult: SearchReplaceResult, elementsChecked: Map<Element, Element>} {
    const textNodes = textNodesUnder(document, element, config.elementFilter)
    console.log("textNodes", textNodes)

    for (const node of textNodes) {

        if (node.nodeValue && node.parentElement) {
            elementsChecked.set(element, element)
            if (!node.parentNode || (node.parentNode && !elementsChecked.has(node.parentElement))) {
                const oldValue = node.nodeValue
                if(oldValue.match(config.searchPattern)) {
                    const newValue = oldValue.replace(config.searchPattern, config.replaceTerm)
                    console.log("oldValue", oldValue, "newValue", newValue, "replace", config.replace)
                    if (oldValue !== newValue && config.replace) {
                        console.log("CONTENT: adding to replaced for", node, element)
                        node.nodeValue = newValue
                        searchReplaceResult.count.replaced++
                        searchReplaceResult.replaced = true

                    }
                }
                if (config.replaceNext && searchReplaceResult.replaced) {
                    break
                }
            } else {
                console.log("CONTENT: Not replacing in text node as element is contained in searched map")
            }
        }
    }
    return {searchReplaceResult, elementsChecked}
}

function textNodesUnder(document: Document, element: Node, elementFilter: RegExp) {
    let node: Node | null
    const nodes: Node[] = []
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
    while ((node = walk.nextNode())) {
        if (node && node.nodeValue && !node.nodeName.match(elementFilter)) {
            if (node.nextSibling && node.nextSibling.nodeName.match(elementFilter)) {
                continue
            }

            nodes.push(node)
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
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    const allInputs = getInputElements(document, config.visibleOnly)
    searchReplaceResult = replaceInInputs(config, document, allInputs, searchReplaceResult)
    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
    }
    return searchReplaceResult
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
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    const otherElementsArr = getFilteredElements(document, config.elementFilter)
    if (config.visibleOnly) {
        searchReplaceResult = replaceVisibleOnly(config, document, otherElementsArr, searchReplaceResult)
        console.log('CONTENT: searchReplaceResult after replaceVisibleOnly', JSON.stringify(searchReplaceResult))
    } else {
        // if there are iframes we take a cautious approach TODO - make this properly replace HTML
        searchReplaceResult = replaceHTMLInElements(config, document, searchReplaceResult)
        console.log('CONTENT: searchReplaceResult after replaceHTMLInElements', JSON.stringify(searchReplaceResult))
    }

    return searchReplaceResult
}

function replaceHTMLInElements(
    config: SearchReplaceConfig,
    document: Document,
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    // start at the root of the document
    const currentElement = document.getElementsByTagName('BODY')[0]
    console.log('CONTENT: current element', currentElement)
    // replaces in inner html per element in the document
    for (const element of currentElement.children) {
        // Check if the child is not a script or style tag etc.
        if (!element.tagName.match(config.elementFilter)) {
            let elementsSearched = new Map<Element, Element>()
            // If the element's parent has already been searched, skip it
            if (element.parentElement && !elementsSearched.has(element.parentElement)) {
                const result = replaceInInnerHTML(config, element, searchReplaceResult, elementsSearched)
                elementsSearched = result.elementsSearched
                searchReplaceResult = result.searchReplaceResult
                if (element.tagName.match(INPUT_TEXTAREA_FILTER)) {
                    searchReplaceResult = replaceInInput(
                        config,
                        document,
                        element as HTMLInputElement,

                        searchReplaceResult
                    )
                }
                //Replace Next should only match once
                if (config.replaceNext && searchReplaceResult.replaced) {
                    console.log("CONTENT: stopping replace as replaceNext set and we've already replaced")
                    config.replace = false
                }
            } else {
                elementsSearched.set(element, element)
            }
        }
    }

    return searchReplaceResult
}

function replaceNextOnly(flags: string): boolean {
    return flags.indexOf(RegexFlags.Global) === -1
}

function replaceVisibleOnly(
    config: SearchReplaceConfig,
    document: Document,
    elements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    const unhidden: HTMLElement[] = Array.from(elements).filter(elementIsVisible)
    console.log('CONTENT: unhidden elements', unhidden)
    // replace inner texts first, dropping out if we have done a replacement and are not working globally
    searchReplaceResult = replaceInnerText(config, document, unhidden, searchReplaceResult)
    console.log('CONTENT: searchReplaceResult after replaceInnerText', JSON.stringify(searchReplaceResult))
    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
    }
    // then replace inputs
    const inputs: HTMLInputElement[] = unhidden.filter((el) =>
        el.tagName.match(INPUT_TEXTAREA_FILTER)
    ) as HTMLInputElement[]
    searchReplaceResult = replaceInInputs(config, document, inputs, searchReplaceResult)
    console.log('CONTENT: searchReplaceResult after replaceInInputs', JSON.stringify(searchReplaceResult))
    return searchReplaceResult
}

// Custom Functions

async function replaceInEditorContainers(
    config: SearchReplaceConfig,
    richTextEditor: RichTextEditor,
    containers: (Element | Document)[],
    searchReplaceResult: SearchReplaceResult
): Promise<SearchReplaceResult> {
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
            searchReplaceResult = await replaceInEditors(config, editors, searchReplaceResult)
            if (config.replaceNext && searchReplaceResult) {
                config.replace = false
            }
        }
    } catch (err) {
        console.error(err)
        return searchReplaceResult
    }

    return searchReplaceResult
}

async function replaceInEditors(
    config: SearchReplaceConfig,
    editors: Element[],
    searchReplaceResult: SearchReplaceResult
): Promise<SearchReplaceResult> {
    let elementsSearched = new Map<Element, Element>()
    for (const editor of editors) {
        const result = replaceInInnerHTML(config, editor as HTMLElement, searchReplaceResult, elementsSearched)
        elementsSearched = result.elementsSearched
        searchReplaceResult = result.searchReplaceResult
        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
    }
    return searchReplaceResult
}

function replaceInInnerHTML(
    config: SearchReplaceConfig,
    element: HTMLElement | Element,
    searchReplaceResult: SearchReplaceResult,
    elementsSearched: Map<Element, Element>
): { searchReplaceResult: SearchReplaceResult; elementsSearched: Map<Element, Element> } {
    let oldValue = element.innerHTML
    const occurrences = oldValue.match(config.searchPattern)
    elementsSearched.set(element as HTMLElement, element as HTMLElement)
    if (occurrences) {
        searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
        // select the content editable area
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
            searchReplaceResult.count.replaced++
            searchReplaceResult.replaced = true
            element.dispatchEvent(new Event('input', { bubbles: true }))
        }
    }
    return { searchReplaceResult, elementsSearched }
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
    searchReplaceResult: SearchReplaceResult
): Promise<SearchReplaceResult> {
    // replacement functions for pages with text editors
    for (const richTextEditor of RICH_TEXT_EDITORS) {
        if (richTextEditor.container) {
            const containers = Array.from(document.querySelectorAll(richTextEditor.container.value.join(',')))
            if (containers.length) {
                searchReplaceResult = await replaceInEditorContainers(
                    config,
                    richTextEditor,
                    containers,
                    searchReplaceResult
                )
                if (config.replaceNext && searchReplaceResult.replaced) {
                    config.replace = false
                }
            }
        } else {
            const editors = Array.from(document.querySelectorAll(richTextEditor.editor.value.join(',')))
            searchReplaceResult = await replaceInEditors(config, editors, searchReplaceResult)
            document.body.dispatchEvent(new Event('input', { bubbles: true }))
            if (config.replaceNext && searchReplaceResult.replaced) {
                config.replace = false
            }
        }
    }

    return searchReplaceResult
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
    let searchReplaceResult: SearchReplaceResult = {
        count: { original: Number(0), replaced: Number(0) },
        replaced: false,
    }
    console.log('CONTENT: searchReplaceResult initially', JSON.stringify(searchReplaceResult))
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
    const iframeDocuments = !iframesOnDifferentHosts
        ? iframes.map((iframe) => iframe.contentDocument).filter(notEmpty)
        : []
    const documents: Document[] = [window.document, ...iframeDocuments]
    for (const document of documents) {
        console.log('CONTENT: Searching document', document)
        // replacement functions for pages with text editors
        searchReplaceResult = await replaceInCMSEditors(config, document, searchReplaceResult)
        console.log('CONTENT: searchReplaceResult after CMS Editors', JSON.stringify(searchReplaceResult))
        if (config.replaceNext && searchReplaceResult.replaced) {
            console.log('CONTENT: setting replace to false')
            config.replace = false
        }

        // we check other places if text was not replaced in a text editor
        if (!searchReplaceResult.replaced) {
            if (inputFieldsOnly) {
                searchReplaceResult = replaceInputFields(config, document, searchReplaceResult)
                if (config.replaceNext && searchReplaceResult.replaced) {
                    config.replace = false
                }
                console.log(
                    'CONTENT: searchReplaceResult after replaceInputFields',
                    JSON.stringify(searchReplaceResult)
                )
            } else {
                searchReplaceResult = replaceHTML(config, document, searchReplaceResult)
                console.log('CONTENT: searchReplaceResult after replaceHTML', JSON.stringify(searchReplaceResult))
            }
        }
    }
    return searchReplaceResult
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
                checkIframes: iframeOnDifferentHosts,
            }
            console.log(
                'CONTENT:',
                'iframes',
                iframes,
                'isIframe',
                isIframe,
                'iframesOnDifferentHosts',
                checkIframeHosts(iframes)
            )
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
