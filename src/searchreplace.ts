import { ELEMENT_FILTER } from './constants'
import {
    RegexFlags,
    ReplaceFunctionReturnType,
    SearchReplaceArgs,
    SearchReplaceConfig,
    SearchReplaceContentMessage,
    SearchReplaceResponse,
    SearchReplaceResult,
} from './types/index'
import {
    copyElementAndRemoveSelectedElements,
    elementIsVisible,
    getInitialIframeElement,
    getInputElements,
    getRespondingIframes,
    getSearchableIframes,
    inIframe,
    isBlobIframe,
    isEditable,
    isHidden,
    isInputElement,
    isWYSIWYGEditorIframe,
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
        element.setAttribute('value', value)
        element.shadowRoot?.getElementById(element.id)?.setAttribute('value', value)
    }
}

function replaceInInputShadow(
    input: HTMLInputElement | HTMLTextAreaElement,
    config: SearchReplaceConfig,
    newValue: string
) {
    for (const shadowRoot of config.shadowRoots) {
        // Try to locate the same input inside the shadow root, from the most precise selector
        // to the least, stopping at the first that matches anything
        const selectors = [
            `input[id="${input.id}"]`,
            `input[name="${input.name}"]`,
            `input[value="${input.value}"]`,
            // perform less exact search
            `*[value="${input.value}"]`,
        ]
        const shadowInputs = selectors
            .map((selector) => Array.from(shadowRoot.querySelectorAll(selector)))
            .find((matches) => matches.length)

        if (shadowInputs) {
            for (const shadowInput of shadowInputs) {
                if (isValueElement(shadowInput)) {
                    shadowInput.value = newValue
                } else {
                    shadowInput.setAttribute('value', newValue)
                }
                shadowInput.dispatchEvent(new Event('input', { bubbles: true }))
            }
            shadowRoot.host.dispatchEvent(new Event('input', { bubbles: true }))
        }
    }
}

function isValueElement(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
    return element.nodeName === 'INPUT' || element.nodeName === 'TEXTAREA'
}

function isSrcdocIframe(element: Element): element is HTMLIFrameElement {
    return element.nodeName === 'IFRAME' && element.hasAttribute('srcdoc')
}

/**
 * `innerText` exists on HTMLElement but not on Element, so SVG and MathML elements have none.
 * Returning '' for those keeps callers, which all go on to call `String.match`, from throwing.
 */
function getInnerText(element: Element | undefined): string {
    if (element && 'innerText' in element) {
        return (element as HTMLElement).innerText ?? ''
    }
    return ''
}

function getValue(node: Element | Node, config: SearchReplaceConfig): string {
    const nodeElement = getElementFromNode(node)
    if (nodeElement) {
        // if it's an input or a textarea, take the value
        if (isValueElement(nodeElement)) {
            return nodeElement.value
        }
        // if it's an iframe with srcdoc, take the srcdoc
        if (isSrcdocIframe(nodeElement)) {
            return nodeElement.srcdoc
        }
        // if it's a contenteditable div, take the outerHTML if we're replacing HTML, otherwise take the innerHTML
        if (/^(?:DIV|BODY)$/.test(nodeElement.nodeName) && nodeElement.hasAttribute('contenteditable')) {
            return config.searchTarget === 'innerHTML' ? nodeElement.outerHTML : nodeElement.innerHTML
        }
        // if the search target is innerHTML, take the innerHTML
        if (config.searchTarget === 'innerHTML') {
            return nodeElement.innerHTML
        }
    }
    // If it's a text node, return the nodeValue
    if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue || ''
    }
    // Otherwise return the innerText
    return getInnerText(nodeElement)
}

function replaceInInput(
    config: SearchReplaceConfig,
    document: Document,
    input: HTMLInputElement | HTMLTextAreaElement,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    if (input.value !== undefined) {
        const oldValue = getValue(input, config)
        const occurrences = oldValue.match(config.searchPattern)
        if (occurrences) {
            searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
            const newValue = input.value.replace(config.searchPattern, config.replaceTerm)

            if (config.replace && oldValue !== newValue) {
                replaceInInputShadow(input, config, newValue)
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

function containsAncestor(element: Element, results: Map<Element, SearchReplaceResult>): boolean {
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
    let target = getValue(el, config)

    if (config.hiddenContent && config.searchTarget === 'innerText' && el.tagName !== 'IFRAME') {
        // textContent contains text of visible and hidden elements
        target = (el as HTMLElement).textContent || ''
    }
    const matches = target.match(config.globalSearchPattern) || []
    return matches.length
}

function replaceInContentEditableDiv(
    element: Element,
    oldValue: string,
    occurrences: RegExpMatchArray,
    config: SearchReplaceConfig
) {
    const newValue = oldValue.replace(config.searchPattern, config.replaceTerm)
    const replaceTarget = config.searchTarget === 'innerHTML' ? 'outerHTML' : 'innerHTML'
    return replaceInNodeOrElement(element, newValue, occurrences, config, replaceTarget)
}

type ReplaceTarget = 'innerText' | 'innerHTML' | 'outerHTML'

/**
 * Assigns to one of the text-bearing properties without indexing into the element by string.
 *
 * The innerHTML and outerHTML writes take markup that was read out of the same page, with the
 * user's replacement substituted into it, and put it back. CodeQL flags that round trip as
 * js/xss-through-dom, and the data flow it describes is real: page markup is re-parsed as HTML.
 * It is also precisely what the "Replace HTML" option exists to do, and it only ever runs on the
 * page the user is looking at, at their explicit request, with a replacement they typed
 * themselves. There is no privilege boundary being crossed — no content moves between origins,
 * and the extension grants the page nothing it did not already have.
 *
 * The previous form, `nodeElement[config.searchTarget] = newValue`, had the same behaviour but
 * hid it from static analysis behind a computed property.
 */
function setReplaceTarget(element: Element, target: ReplaceTarget, value: string) {
    if (target === 'innerHTML') {
        element.innerHTML = value
    } else if (target === 'outerHTML') {
        element.outerHTML = value
    } else if ('innerText' in element) {
        ;(element as HTMLElement).innerText = value
    }
}

// TODO make replace function part of config instead of continuously checking innerText vs. innerHTML
function replaceInNodeOrElement(
    node: Node | Element,
    newValue: string,
    occurrences: RegExpMatchArray,
    config: SearchReplaceConfig,
    replaceTarget?: ReplaceTarget
) {
    const nodeElement = getElementFromNode(node)
    if (config.searchTarget === 'innerHTML' && nodeElement) {
        setReplaceTarget(nodeElement, config.searchTarget, newValue)
    } else if (replaceTarget && nodeElement) {
        setReplaceTarget(nodeElement, replaceTarget, newValue)
    } else {
        // replace in innerText but use nodeValue only as innerText contains text of descendent elements
        node.nodeValue = newValue
    }
    // adds one to replaced count if a replacement was made, adds occurrences if a global replace is made
    const replacementCount = config.replaceAll ? occurrences.length : 1
    nodeElement?.dispatchEvent(new Event('input', { bubbles: true }))

    return { node, replacementCount, replaced: true }
}

function getElementFromNode(node: Node): Element | undefined {
    let element = node as Element
    if (node.nodeType === Node.TEXT_NODE) {
        if (node.parentElement) {
            element = node.parentElement
        } else {
            return undefined
        }
    }
    if (!(element && element.nodeType === Node.ELEMENT_NODE)) {
        throw new Error('Unsupported node type')
    }
    return element
}

function isIgnored(ignoredElements: Set<Element>, node: Node, hiddenContent: boolean, elementFilter: RegExp): number {
    const toCheck = getElementFromNode(node)
    // if there is no element, reject
    if (!toCheck) {
        return NodeFilter.FILTER_REJECT
    }

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
        if (!config.replace) {
            break
        }

        if (walked.has(node)) {
            continue
        }
        walked.add(node)
        const nodeElement = getElementFromNode(node)

        if (!nodeElement) {
            continue
        }

        if (nodeElement.tagName.match(/INPUT|TEXTAREA/g)) {
            // handled by replaceInInputs
            continue
        }

        // Editable text is handled by replaceInInputs, so skip it here to avoid replacing twice.
        // This previously compared `contentEditable` to the boolean `true`, but that property is
        // a string ('true' | 'false' | 'inherit' | 'plaintext-only'), so the guard never fired.
        // Nothing broke, because editable elements are also dropped from the cloned element and
        // so land in `ignoredElements` — but that made this guard silently redundant rather than
        // the safety net it reads as.
        if (isEditable(nodeElement)) {
            continue
        }

        if (nodeElement.tagName === 'WINDOW') {
            continue
        }
        const oldValue = getValue(node, config)
        const occurrences = oldValue.match(config.globalSearchPattern)

        if (!occurrences) {
            continue
        }

        if (!config.hiddenContent && isHidden(nodeElement, false)) {
            continue
        }

        if (config.replace) {
            const newValue = oldValue.replace(config.searchPattern, config.replaceTerm)
            if (node && oldValue && oldValue !== newValue) {
                // Do the replacement
                const replaceResult = replaceInNodeOrElement(node, newValue, occurrences, config)
                elementsChecked = updateResults(
                    elementsChecked,
                    node as Element,
                    replaceResult.replaced,
                    occurrences.length,
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
    if (!(config.searchTarget in element)) {
        elementsChecked = updateResults(elementsChecked, element, false, 0, 0)
        return { searchReplaceResult, elementsChecked }
    }

    // When replacing in HTML the whole of the original element's innerHTML is rewritten, hidden
    // and filtered descendants included. The count therefore has to be taken from that same
    // string: counting on the filtered clone reported fewer matches than were really replaced,
    // and the popup displayed the difference as a negative number ("-2 matches").
    const countTarget = config.replace && config.searchTarget === 'innerHTML' ? originalElement : element
    const occurrences = countOccurrences(countTarget, config)
    elementsChecked = updateResults(elementsChecked, element, false, occurrences, 0)

    if (config.searchTarget === 'innerHTML') {
        searchReplaceResult.count.original = searchReplaceResult.count.original + occurrences
    } else if (config.searchTarget === 'innerText') {
        // Skip elements whose ancestor was already counted: the ancestor's innerText already
        // contained this element's text, so adding it again would double count.
        // (The hiddenContent flag used to select between two identical branches here.)
        if (!containsAncestor(element, elementsChecked)) {
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

    return { searchReplaceResult, elementsChecked }
}

function replaceInInputs(
    config: SearchReplaceConfig,
    document: Document,
    inputs: (HTMLInputElement | HTMLTextAreaElement | HTMLElement)[],
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    for (const input of inputs) {
        if ('value' in input) {
            // input, textarea
            const inputResult = replaceInInput(config, document, input, searchReplaceResult, elementsChecked)
            searchReplaceResult = inputResult.searchReplaceResult
            elementsChecked = inputResult.elementsChecked
            if (config.replaceNext && searchReplaceResult.replaced) {
                config.replace = false
            }
        } else {
            const oldValue = getValue(input, config)
            const occurrences = oldValue.match(config.globalSearchPattern)
            if (occurrences) {
                searchReplaceResult.count.original = Number(searchReplaceResult.count.original) + occurrences.length
                if (config.replace) {
                    // contenteditable
                    const elementResult = replaceInContentEditableDiv(input, oldValue, occurrences, config)
                    elementsChecked = updateResults(
                        elementsChecked,
                        input,
                        elementResult.replaced,
                        occurrences.length,
                        elementResult.replacementCount
                    )
                    searchReplaceResult.count.replaced += elementResult.replacementCount
                    searchReplaceResult.replaced = elementResult.replaced
                    input.dispatchEvent(new Event('input', { bubbles: true }))
                    if (config.replaceNext && searchReplaceResult.replaced) {
                        config.replace = false
                        break
                    }
                }
            }
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

function replaceInSrcDocIframe(
    config: SearchReplaceConfig,
    iframe: HTMLIFrameElement,
    searchReplaceResult: SearchReplaceResult,
    elementsChecked: Map<Element, SearchReplaceResult>
): ReplaceFunctionReturnType {
    const occurrences = countOccurrences(iframe, config)
    elementsChecked = updateResults(elementsChecked, iframe, false, occurrences, 0)
    searchReplaceResult.count.original = searchReplaceResult.count.original + occurrences
    if (config.replace && occurrences) {
        iframe.srcdoc = iframe.srcdoc.replace(config.searchPattern, config.replaceTerm)
        searchReplaceResult.count.replaced += config.replaceAll ? occurrences : 1
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
    for (const [originalIndex, originalElement] of originalElements.entries()) {
        let clonedElement = originalElement.cloneNode(true) as HTMLElement

        const { clonedElementRemoved, removedSet } = copyElementAndRemoveSelectedElements(
            clonedElement,
            // Remove elements that
            // - match the element filter, but are not blob iframes, nor are WYSIWYG iframes.
            //   Removes SCRIPT, STYLE, IFRAME, etc.
            // - match the input filter, as these are handled later
            // - are already in the elementsChecked map
            (el: HTMLElement) =>
                (!!el.nodeName.match(config.elementFilter) && !isBlobIframe(el) && !isWYSIWYGEditorIframe(el)) ||
                isInputElement(el) ||
                elementsChecked.has(el),
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

        // Now replace in input fields
        const inputResult = replaceInInputs(
            config,
            document,
            getInputElements(originalElement, elementsChecked, config.hiddenContent),
            searchReplaceResult,
            elementsChecked
        )

        searchReplaceResult = inputResult.searchReplaceResult
        elementsChecked = inputResult.elementsChecked

        if (config.replaceNext && searchReplaceResult.replaced) {
            config.replace = false
        }
    }
    return { searchReplaceResult, elementsChecked }
}
function replaceNextOnly(flags: string): boolean {
    return flags.indexOf(RegexFlags.Global) === -1
}

export async function searchReplace(args: SearchReplaceArgs): Promise<ReplaceFunctionReturnType> {
    const {
        action,
        window,
        searchTerm,
        replaceTerm,
        inputFieldsOnly,
        isRegex,
        hiddenContent,
        wholeWord,
        matchCase,
        replaceHTML,
        replaceAll,
        isIframe,
        iframes,
        elementFilter = ELEMENT_FILTER,
    } = args
    const searchReplaceResult: SearchReplaceResult = {
        count: { original: 0, replaced: 0 },
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
    let shadowRoots: ShadowRoot[] = []
    if (replace) {
        shadowRoots = Array.from(document.querySelectorAll('*'))
            .map((el) => el.shadowRoot)
            .filter(notEmpty)
    }

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
        shadowRoots,
    }
    // we check other places if text was not replaced in a text editor
    let result: ReplaceFunctionReturnType = { searchReplaceResult, elementsChecked }
    if (inputFieldsOnly) {
        result = replaceInputFields(config, document, searchReplaceResult, elementsChecked)
        if (config.replaceNext && result.searchReplaceResult.replaced) {
            config.replace = false
        }
    } else {
        const startingElement = document.body || document.querySelector('div')

        const searchableIframesInitial = await getSearchableIframes(window, document)
        const srcDocIframes = searchableIframesInitial.filter((iframe) => iframe.hasAttribute('srcdoc'))
        srcDocIframes.map((iframe) => {
            const srcDocResult = replaceInSrcDocIframe(
                config,
                iframe,
                result.searchReplaceResult,
                result.elementsChecked
            )
            result.searchReplaceResult = srcDocResult.searchReplaceResult
            result.elementsChecked = srcDocResult.elementsChecked
        })
        const searchableIframes = searchableIframesInitial.filter((iframe: HTMLIFrameElement) => {
            return iframe.srcdoc === '' || iframe.srcdoc === undefined
        })
        const searchable = searchableIframes.map(getInitialIframeElement).filter(notEmpty)
        result = replaceInHTML(config, document, [startingElement, ...searchable], searchReplaceResult, elementsChecked)
    }

    return result
}

// `typeof` guard rather than a truthiness check: `chrome` is not merely falsy but *undeclared*
// outside an extension context (e.g. under jest), where a bare reference throws a ReferenceError
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg: SearchReplaceContentMessage, sender, sendResponse) {
        try {
            const instance = msg.instance
            const replaceAll = msg.action === 'count' ? true : instance.options.replaceAll
            const action = msg.action
            // are we in an iframe?
            const isIframe = inIframe()
            // get all iframes
            const iframes = getRespondingIframes(window, window.document)
            // Setup event listeners to communicate between iframes and parent
            searchReplace({
                action,
                window,
                searchTerm: instance.searchTerm,
                replaceTerm: instance.replaceTerm,
                inputFieldsOnly: instance.options.inputFieldsOnly,
                isRegex: instance.options.isRegex,
                hiddenContent: instance.options.hiddenContent,
                wholeWord: instance.options.wholeWord,
                matchCase: instance.options.matchCase,
                replaceHTML: instance.options.replaceHTML,
                replaceAll,
                isIframe,
                iframes,
                elementFilter: ELEMENT_FILTER,
            }).then((result) => {
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
        } catch (err) {
            console.error('Error in content script', err)
            sendResponse({ action: 'searchReplaceResponsePopup', msg: err })
        }
    })
}
