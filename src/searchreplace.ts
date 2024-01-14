import { ELEMENT_FILTER, INPUT_TEXTAREA_FILTER, RICH_TEXT_EDITORS } from './constants'
import {
    RegexFlags,
    ReplaceFunctionReturnType,
    RichTextEditor,
    SearchReplaceActions,
    SearchReplaceConfig,
    SearchReplaceContentMessage,
    SearchReplaceResponse,
    SearchReplaceResult,
} from './types/index'
import { checkIframeHosts, elementIsVisible, getIframeElements, getInputElements, inIframe, isBlobIframe } from './util'
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
    let ancestor = element.parentElement
    while (ancestor) {
        if (results.has(ancestor)) {
            return true
        }
        ancestor = ancestor.parentElement
    }
    return false
}

function countOccurrences(el: HTMLElement, config: SearchReplaceConfig) {
    const matches = el.innerText.match(config.globalSearchPattern)
    const occurrences = matches ? matches.length : 0
    // const iframes = Array.from(el.getElementsByTagName('iframe'))
    // if (iframes.length) {
    //
    //     for (const iframe of iframes) {
    //         if (iframe.contentDocument && !isBlobIframe(iframe)) {
    //             const iframeOccurrences = countOccurrences(iframe.contentDocument.body, config)
    //             if (iframeOccurrences) {
    //                 occurrences -= iframeOccurrences
    //             }
    //         }
    //     }
    // }

    return occurrences
}

function replaceInnerText(
    config: SearchReplaceConfig,
    elements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    for (const element of elements) {
        // continue if there is no inner text
        if (element.innerText === undefined) {
            //
            continue
        }

        const occurrences = countOccurrences(element, config)

        // continue if there are no occurrences
        if (!occurrences) {
            //
            continue
        }

        const nodeValue = element.childNodes[0].nodeValue
        const nodeType = element.childNodes[0].nodeType

        // continue if there is no node value or the node is not a text type
        if (!nodeValue || !(nodeType === 3)) {
            //
            continue
        }

        const ancestorChecked = containsAncestor(element, elementsChecked)
        elementsChecked = updateResults(elementsChecked, element, false, occurrences, 0)

        searchReplaceResult.count.original =
            ancestorChecked && elementIsVisible(element)
                ? searchReplaceResult.count.original
                : searchReplaceResult.count.original + occurrences
        const oldValue = nodeValue
        const newValue = oldValue.replace(config.searchPattern, config.replaceTerm)
        if (config.replace && oldValue !== newValue) {
            element.childNodes[0].nodeValue = newValue
            const replacementCount = config.replaceAll ? occurrences : 1
            elementsChecked = updateResults(elementsChecked, element, true, occurrences, replacementCount)
            searchReplaceResult.count.replaced += replacementCount // adds one to replaced count if a replacement was made, adds occurrences if a global replace is made
            searchReplaceResult.replaced = true
            element.dispatchEvent(new Event('input', { bubbles: true }))
            if (config.replaceNext) {
                config.replace = false
            }
        }
        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
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

function getFilteredElements(document: Document, elementFilter: RegExp) {
    const otherElements = document.body.getElementsByTagName('*')

    const otherElementsArr: HTMLElement[] = Array.from(otherElements).filter(
        (el) => !el.tagName.match(elementFilter)
    ) as HTMLElement[]
    // remove iframes that are not blobs
    return otherElementsArr.filter((el) => el.tagName !== 'IFRAME' || isBlobIframe(el))
}

type PartitionResult = [(HTMLInputElement | HTMLTextAreaElement)[], HTMLElement[]]

//Partition function
function partitionElements(array: HTMLElement[]): PartitionResult {
    const inputs: (HTMLInputElement | HTMLTextAreaElement)[] = []
    const others: HTMLElement[] = []
    array.forEach((e) => (e.tagName.match(INPUT_TEXTAREA_FILTER) ? inputs : others).push(e))
    return [inputs as (HTMLInputElement | HTMLTextAreaElement)[], others]
}

function replaceHTML(
    config: SearchReplaceConfig,
    document: Document,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    let otherElementsArr = getFilteredElements(document, config.elementFilter).filter((el) => !elementsChecked.has(el))

    if (config.visibleOnly) {
        //TODO check visibility of elements based on their parents and not just their own style tags
        otherElementsArr = otherElementsArr.filter(elementIsVisible)
    }
    const visibleOnlyResult = replaceInElements(
        config,
        document,
        otherElementsArr,
        searchReplaceResult,
        elementsChecked
    )
    searchReplaceResult = visibleOnlyResult.searchReplaceResult
    elementsChecked = visibleOnlyResult.elementsChecked

    return { searchReplaceResult, elementsChecked }
}
function replaceNextOnly(flags: string): boolean {
    return flags.indexOf(RegexFlags.Global) === -1
}

function replaceInElements(
    config: SearchReplaceConfig,
    document: Document,
    elements: HTMLElement[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    // get unhidden, unchecked elements

    const [inputs, others] = partitionElements(elements)

    // replace inner texts first, dropping out if we have done a replacement and are not working globally
    const innerTextResult = replaceInnerText(config, others, searchReplaceResult, elementsChecked)

    searchReplaceResult = innerTextResult.searchReplaceResult
    elementsChecked = innerTextResult.elementsChecked
    //TODO don't include iframes in counts for body!!!

    if (config.replaceNext && searchReplaceResult.replaced) {
        config.replace = false
    }

    // remove checked elements from inputs

    console.log(
        'CONTENT: elementsChecked with count',
        Array.from(elementsChecked)
            .filter((e) => e[1].count.original)
            .map((e) => e[0].innerHTML)
    )
    const inputsToCheck = inputs.filter((input) => !elementsChecked.has(input))
    inputsToCheck.map((input) => elementsChecked.set(input, newSearchReplaceCount()))
    const inputResult = replaceInInputs(config, document, inputsToCheck, searchReplaceResult, elementsChecked)
    searchReplaceResult = inputResult.searchReplaceResult
    elementsChecked = inputResult.elementsChecked

    return { searchReplaceResult, elementsChecked }
}

// Custom Functions

async function replaceInEditorContainers(
    config: SearchReplaceConfig,
    richTextEditor: RichTextEditor,
    containers: (Element | Document)[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
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
        return { searchReplaceResult, elementsChecked }
    }

    return { searchReplaceResult, elementsChecked }
}

async function replaceInEditors(
    config: SearchReplaceConfig,
    editors: Element[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): Promise<ReplaceFunctionReturnType> {
    for (const editor of editors) {
        const innerResult = replaceInInnerHTML(config, editor as HTMLElement, searchReplaceResult, elementsChecked)
        searchReplaceResult = innerResult.searchReplaceResult
        elementsChecked = innerResult.elementsChecked
        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
    }
    return { searchReplaceResult, elementsChecked }
}

function replaceInInnerHTML(
    config: SearchReplaceConfig,
    element: HTMLElement | Element,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    // take a copy of the element except with iframes removed from within
    const elementCopy = element.cloneNode(true) as HTMLElement
    const iframes = Array.from(elementCopy.getElementsByTagName('iframe'))
    iframes.forEach((iframe) => iframe.parentNode?.removeChild(iframe))

    let oldValue = element.innerHTML
    const occurrences = elementCopy.innerHTML.match(config.searchPattern)

    elementsChecked.set(element, newSearchReplaceCount())
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
            const replaceCount = config.replaceAll ? occurrences.length : 1
            elementsChecked = updateResults(elementsChecked, element, true, occurrences.length, replaceCount)

            searchReplaceResult.count.replaced += replaceCount
            searchReplaceResult.replaced = true

            element.dispatchEvent(new Event('input', { bubbles: true }))
        }
    }
    return { searchReplaceResult, elementsChecked }
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
    elementsChecked: Map<Element, SearchReplaceResult>
): Promise<ReplaceFunctionReturnType> {
    // replacement functions for pages with text editors
    for (const richTextEditor of RICH_TEXT_EDITORS) {
        if (richTextEditor.container) {
            const containers = Array.from(document.querySelectorAll(richTextEditor.container.value.join(',')))
            if (containers.length) {
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

    return { searchReplaceResult, elementsChecked }
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

    // replacement functions for pages with text editors
    let result = await replaceInCMSEditors(config, document, searchReplaceResult, elementsChecked)
    if (config.replaceNext && result.searchReplaceResult.replaced) {
        config.replace = false
    }

    // we check other places if text was not replaced in a text editor

    if (!result.searchReplaceResult.replaced || (config.replaceAll && result.searchReplaceResult.replaced)) {
        if (inputFieldsOnly) {
            result = replaceInputFields(config, document, result.searchReplaceResult, result.elementsChecked)
            if (config.replaceNext && result.searchReplaceResult.replaced) {
                config.replace = false
            }
            console.log(
                'CONTENT: searchReplaceResult after replaceInputFields',
                JSON.stringify(result.searchReplaceResult)
            )
        } else {
            result = replaceHTML(config, document, result.searchReplaceResult, result.elementsChecked)
        }
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

        // are the iframes on different hosts?
        const iframeOnDifferentHosts = checkIframeHosts(iframes)
        // get the element filter. If there are blob iframes then we need to include them in the search

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
