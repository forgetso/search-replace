'use strict'

import { ELEMENT_FILTER, INPUT_TEXTAREA_FILTER, RICH_TEXT_EDITORS } from './constants'
import {
    RegexFlags,
    RichTextEditor,
    SearchReplaceCommonActions,
    SearchReplaceConfig,
    SearchReplaceContentMessage,
    SearchReplaceResponse,
    SearchReplaceResult,
} from './types/index'
import { elementIsVisible, getIframeElements, getInputElements, inIframe, tabConnect } from './util'
import { getFlags, getSearchPattern } from './regex'
import { getHints } from './hints'

// are we in an iframe?
const isIframe = inIframe()
// get all iframes
const iframes = getIframeElements(window.document)

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
    usesKnockout: boolean,
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

                if (usesKnockout) {
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
    const elementsCounted: HTMLElement[] = []
    for (const element of elements) {
        if (element.innerText !== undefined) {
            const occurrences = element.innerText.match(config.searchPattern)

            if (occurrences) {
                console.log('CONTENT: occurrences', occurrences, element)
                elementsCounted.push(element)

                if (element.parentElement && !elementsCounted.includes(element.parentElement)) {
                    searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
                    if (config.replace) {
                        searchReplaceResult = replaceInTextNodes(config, document, element, searchReplaceResult)
                    }
                    if (config.replaceNext && searchReplaceResult.replaced) {
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
    searchReplaceResult: SearchReplaceResult
) {
    const textNodes = textNodesUnder(document, element)
    const nodesReplaced: Node[] = []
    for (const node of textNodes) {
        if (node.nodeValue) {
            if (!node.parentNode || (node.parentNode && !nodesReplaced.includes(node.parentNode))) {
                const oldValue = node.nodeValue
                const newValue = oldValue.replace(config.searchPattern, config.replaceTerm)
                if (oldValue !== newValue && config.replace) {
                    node.nodeValue = newValue
                    searchReplaceResult.count.replaced++
                    searchReplaceResult.replaced = true
                    nodesReplaced.push(node)
                }
                if (config.replaceNext && searchReplaceResult.replaced) {
                    break
                }
            } else {
                nodesReplaced.push(node)
            }
        } else {
            nodesReplaced.push(node)
        }
    }
    return searchReplaceResult
}

function textNodesUnder(document: Document, element: Node) {
    let node: Node | null
    const nodes: Node[] = []
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
    while ((node = walk.nextNode())) {
        if (node && node.nodeValue && !node.nodeName.match(ELEMENT_FILTER)) {
            if (node.nextSibling && node.nextSibling.nodeName.match(ELEMENT_FILTER)) {
                continue
            }

            nodes.push(node)
        }
    }
    return nodes
}

function replaceHTMLInBody(
    config: SearchReplaceConfig,
    body: HTMLBodyElement,
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    if (body) {
        const oldValue = body.innerHTML
        const occurrences = body.innerHTML.match(config.searchPattern)
        console.log('CONTENT: occurrences', occurrences)
        console.log('CONTENT: config.searchPattern', config.searchPattern)
        if (occurrences) {
            searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length

            const newValue = body.innerHTML.replace(config.searchPattern, config.replaceTerm)

            if (oldValue !== newValue && config.replace) {
                body.innerHTML = newValue
                searchReplaceResult.count.replaced++
                searchReplaceResult.replaced = true
            }
        }
    }
    return searchReplaceResult
}

function replaceInInputs(
    config: SearchReplaceConfig,
    document: Document,
    inputs: (HTMLInputElement | HTMLTextAreaElement)[],
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    const ko = usesKnockout(document)
    for (const input of inputs) {
        searchReplaceResult = replaceInInput(config, document, input, ko, searchReplaceResult)
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
    const iframes = getIframeElements(document)
    const allInputs = getInputElements(document, config.visibleOnly)
    searchReplaceResult = replaceInInputs(config, document, allInputs, searchReplaceResult)
    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
    }

    for (let iframeCount = 0; iframeCount < iframes.length; iframeCount++) {
        const iframe = iframes[0]
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            const iframeInputs = getInputElements(iframe.contentDocument!, config.visibleOnly)
            searchReplaceResult = replaceInInputs(config, document, iframeInputs, searchReplaceResult)
            if (config.replaceNext && searchReplaceResult.replaced) {
                config.replace = false
            }
        }
    }
    return searchReplaceResult
}

function replaceHTML(
    config: SearchReplaceConfig,
    document: Document,
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    const iframes: NodeListOf<HTMLIFrameElement> = document.querySelectorAll('iframe')
    const otherElements = document.body.getElementsByTagName('*')
    const otherElementsArr: HTMLElement[] = Array.from(otherElements).filter(
        (el) => !el.tagName.match(ELEMENT_FILTER)
    ) as HTMLElement[]
    if (iframes.length === 0) {
        if (config.visibleOnly) {
            searchReplaceResult = replaceVisibleOnly(config, document, otherElementsArr, searchReplaceResult)
            console.log('CONTENT: searchReplaceResult after replaceVisibleOnly', JSON.stringify(searchReplaceResult))
        } else {
            // when there are no iframes we are free to replace html directly in the body
            searchReplaceResult = replaceHTMLInBody(config, document.body as HTMLBodyElement, searchReplaceResult)
            console.log('CONTENT: searchReplaceResult after replaceHTMLInBody', JSON.stringify(searchReplaceResult))
        }
    } else {
        searchReplaceResult = replaceHTMLInIframes(config, document, iframes, searchReplaceResult)
        if (config.visibleOnly) {
            searchReplaceResult = replaceVisibleOnly(config, document, otherElementsArr, searchReplaceResult)
        } else {
            // if there are iframes we take a cautious approach TODO - make this properly replace HTML
            searchReplaceResult = replaceHTMLInElements(config, document, otherElementsArr, searchReplaceResult)
        }
    }
    return searchReplaceResult
}

function replaceHTMLInIframes(
    config: SearchReplaceConfig,
    document: Document,
    iframes: NodeListOf<HTMLIFrameElement>,
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    for (const iframe of iframes) {
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            try {
                const content = iframe.contentDocument?.body as HTMLBodyElement
                if (config.visibleOnly) {
                    searchReplaceResult = replaceVisibleOnly(config, document, [content], searchReplaceResult)
                } else {
                    searchReplaceResult = replaceHTMLInBody(config, content, searchReplaceResult)
                }
            } catch (e) {
                console.error(e)
            }
        }
    }
    return searchReplaceResult
}

function replaceHTMLInElements(
    config: SearchReplaceConfig,
    document: Document,
    elements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    // replaces in inner html per element in the document
    const filtered = Array.from(elements).filter((el) => !el.tagName.match(ELEMENT_FILTER))
    for (const element of filtered) {
        searchReplaceResult = replaceInInnerHTML(config, element, searchReplaceResult)
        if (element.tagName.match(INPUT_TEXTAREA_FILTER)) {
            const ko = usesKnockout(document)
            searchReplaceResult = replaceInInput(config, document, element as HTMLInputElement, ko, searchReplaceResult)
        }
        //Replace Next should only match once
        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
    }
    return searchReplaceResult
}

function replaceNextOnly(flags: string): boolean {
    return flags.indexOf(RegexFlags.Global) === -1
}

function giveElementsUniqueIds(elements: HTMLElement[]) {
    let incrementingId = 0
    return function (element) {
        if (!element.id) {
            incrementingId++
            element.id = `search_replace_id_${incrementingId}`
        }
        return element.id
    }
}

function removeUniqueIds(elements: HTMLElement[]) {
    return function (element) {
        if (element.id) {
            element.removeAttribute('id')
        }
        return element
    }
}

function replaceVisibleOnly(
    config: SearchReplaceConfig,
    document: Document,
    elements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    // replace inner texts first, dropping out if we have done a replacement and are not working globally
    const unhidden: HTMLElement[] = Array.from(elements).filter(elementIsVisible)
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
    for (const editor of editors) {
        searchReplaceResult = replaceInInnerHTML(config, editor as HTMLElement, searchReplaceResult)
        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
    }
    return searchReplaceResult
}

function replaceInInnerHTML(
    config: SearchReplaceConfig,
    element: HTMLElement | Element,
    searchReplaceResult: SearchReplaceResult
): SearchReplaceResult {
    let oldValue = element.innerHTML
    const occurrences = oldValue.match(config.searchPattern)
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
        if (config.replace) {
            element[selector] = newValue
        }
        element.dispatchEvent(new Event('input', { bubbles: true }))
        if (oldValue != newValue && config.replace) {
            element.innerHTML = newValue
            searchReplaceResult.count.replaced++
            searchReplaceResult.replaced = true
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
    action: SearchReplaceCommonActions,
    window: Window,
    searchTerm: string,
    replaceTerm: string,
    inputFieldsOnly: boolean,
    isRegex: boolean,
    visibleOnly: boolean,
    wholeWord: boolean,
    matchCase: boolean,
    replaceAll: boolean
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
    }

    const document = window.document

    // replacement functions for pages with text editors
    searchReplaceResult = await replaceInCMSEditors(config, document, searchReplaceResult)
    console.log('CONTENT: searchReplaceResult after CMS Editors', JSON.stringify(searchReplaceResult))
    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
    }

    // TODO loop everything over document and then iframes
    // replacement functions for iframes with rich text editors
    const iframes = getIframeElements(document)
    for (const iframe of iframes) {
        if (iframe.src.match('^http(s)*://' + window.location.host) && iframe.contentDocument) {
            searchReplaceResult = await replaceInCMSEditors(config, iframe.contentDocument, searchReplaceResult)
            if (config.replaceNext && searchReplaceResult.replaced) {
                config.replace = false
            }
        }
    }
    console.log('CONTENT: searchReplaceResult after iframes', JSON.stringify(searchReplaceResult))

    // we check other places if text was not replaced in a text editor
    if (!searchReplaceResult.replaced) {
        if (inputFieldsOnly) {
            searchReplaceResult = replaceInputFields(config, document, searchReplaceResult)
            if (config.replaceNext && searchReplaceResult.replaced) {
                config.replace = false
            }
            console.log('CONTENT: searchReplaceResult after replaceInputFields', JSON.stringify(searchReplaceResult))
        } else {
            // reset the original count to avoid double counting
            // anything that we've already counted in count.original
            searchReplaceResult.count.original = Number(0)
            if (searchReplaceResult.count.original !== 0) {
                throw new Error('SearchReplaceResult count.original should be 0')
            }
            searchReplaceResult = replaceHTML(config, document, searchReplaceResult)
            console.log('CONTENT: searchReplaceResult after replaceHTML', JSON.stringify(searchReplaceResult))
        }
    }
    return searchReplaceResult
}

const port = tabConnect()

if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg: SearchReplaceContentMessage, sender, sendResponse) {
        console.log('CONTENT: received message with action', msg.action)
        const instance = msg.instance
        const replaceAll = msg.action === 'count' ? true : instance.options.replaceAll
        const action = msg.action
        //Setup event listeners to communicate between iframes and parent
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
            replaceAll
        ).then((result) => {
            const response: SearchReplaceResponse = {
                inIframe: inIframe(),
                result: result,
                location: window.location.toString(),
                action: 'searchReplaceResponse',
                hints: getHints(document),
                iframes: iframes.length,
                instance: instance,
            }

            if (iframes || isIframe) {
                console.log('CONTENT: sending response to background', JSON.stringify(response))
                // Send the response to the background script for processing
                port.postMessage(response)
                sendResponse(null)
            } else {
                // Send the response straight back to the popup
                sendResponse(response)
                console.log('CONTENT: sent response to popup directly', JSON.stringify(response))
            }
        })
    })
}
