'use strict'

import { RegexFlags, RichTextEditor, SearchReplaceAction, SearchReplaceInstance, SelectorType } from './types/index'

const ELEMENT_FILTER = new RegExp('(HTML|HEAD|SCRIPT|BODY|STYLE|IFRAME)')
const INPUT_TEXTAREA_FILTER = new RegExp('(INPUT|TEXTAREA)')
const GOOGLE_MAIL_DOMAIN = 'mail.google.com'
const RICH_TEXT_EDITOR_TINY_MCE: RichTextEditor = {
    editor: { type: SelectorType.id, value: '#tinymce', iframe: false },
    container: { type: SelectorType.class, value: '.mce-edit-area', iframe: true },
}
const RICH_TEXT_EDITOR_GENERIC: RichTextEditor = {
    editor: { type: SelectorType.attribute, value: '[role="textbox"]', iframe: false },
}
const RICH_TEXT_EDITORS: RichTextEditor[] = [RICH_TEXT_EDITOR_TINY_MCE, RICH_TEXT_EDITOR_GENERIC]

function regExEscape(text: string): string {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

function replaceInInnerHTML(element: HTMLElement, searchPattern: RegExp, replaceTerm: string) {
    const searchStr = element.innerHTML
    element.innerHTML = searchStr.replace(searchPattern, replaceTerm)
    return !(element.innerHTML === searchStr)
}

function setNativeValue(element, value) {
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
    input: HTMLInputElement,
    searchPattern: RegExp,
    replaceTerm: string,
    usesKnockout: boolean
): boolean {
    if (input.value === undefined) {
        return false
    }

    const oldValue = input.value
    const newValue = input.value.replace(searchPattern, replaceTerm)

    if (oldValue === newValue) {
        return false
    }

    input.focus()
    setNativeValue(input, newValue)

    if (usesKnockout) {
        const knockoutValueChanger = getKnockoutValueChanger(input.id, newValue)
        document.documentElement.setAttribute('onreset', knockoutValueChanger)
        document.documentElement.dispatchEvent(new CustomEvent('reset'))
        document.documentElement.removeAttribute('onreset')
    }

    // https://stackoverflow.com/a/53797269/1178971
    input.dispatchEvent(new Event('input', { bubbles: true }))

    input.blur()

    return true
}

function replaceInnerText(elements: HTMLElement[], searchPattern: RegExp, replaceTerm: string, flags: string) {
    let replaced = false
    for (const element of elements) {
        if (element.innerText !== undefined) {
            if (element.innerText.match(searchPattern)) {
                replaced = replaceInTextNodes(element, searchPattern, replaceTerm, flags)
                if (flags === RegexFlags.CaseInsensitive) {
                    return replaced
                }
            }
        }
    }
    return replaced
}

function replaceInTextNodes(element: HTMLElement, searchPattern: RegExp, replaceTerm: string, flags: string) {
    let replaced = false
    const textNodes = textNodesUnder(element)
    for (const node of textNodes) {
        const oldValue = node.nodeValue
        node.nodeValue = node.nodeValue!.replace(searchPattern, replaceTerm)
        replaced = oldValue !== node.nodeValue
        if (flags === RegexFlags.CaseInsensitive && replaced) {
            return replaced
        }
    }
    return replaced
}

function textNodesUnder(element: Node) {
    let node: Node | null
    const nodes: Node[] = []
    const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
    while ((node = walk.nextNode())) {
        if (node) {
            nodes.push(node)
        }
    }
    return nodes
}

function replaceHTMLInBody(body: HTMLBodyElement, searchPattern: RegExp, replaceTerm: string): boolean {
    const searchStr = body.innerHTML
    const replaced = body.innerHTML.replace(searchPattern, replaceTerm)
    body.innerHTML = replaced
    return !(searchStr === replaced)
}

function replaceInInputs(
    inputs: HTMLInputElement[],
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string
): boolean {
    let replaced = false
    const ko = usesKnockout()
    for (const input of inputs) {
        replaced = replaceInInput(input, searchPattern, replaceTerm, ko)
        if (flags === RegexFlags.CaseInsensitive && replaced) {
            return replaced
        }
    }
    return replaced
}

function usesKnockout(): boolean {
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

function replaceInputFields(searchPattern: RegExp, replaceTerm: string, flags: string, visibleOnly: boolean): boolean {
    const iframes = document.querySelectorAll('iframe')
    const allInputs: NodeListOf<HTMLInputElement | HTMLTextAreaElement> = document.querySelectorAll('input, textarea')
    const inputTypeFilter: string[] = []
    if (visibleOnly) {
        inputTypeFilter.push('hidden')
    }
    const allInputsArr: HTMLInputElement[] = Array.from(allInputs).filter(
        ({ type }) => inputTypeFilter.indexOf(type) === -1
    ) as HTMLInputElement[]
    const replaced = replaceInInputs(allInputsArr, searchPattern, replaceTerm, flags)
    if (flags === RegexFlags.CaseInsensitive && replaced) {
        return replaced
    }

    for (let iframeCount = 0; iframeCount < iframes.length; iframeCount++) {
        const iframe = iframes[0]
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            const iframeInputs: NodeListOf<HTMLInputElement | HTMLTextAreaElement> =
                document.querySelectorAll('input, textarea')
            const iframeInputsArr: HTMLInputElement[] = Array.from(iframeInputs).filter(
                ({ type }) => inputTypeFilter.indexOf(type) === -1
            ) as HTMLInputElement[]
            const replaced = replaceInInputs(iframeInputsArr, searchPattern, replaceTerm, flags)
            if (replaceNextOnly(flags) && replaced) {
                return replaced
            }
        }
    }
    return false
}

function replaceHTML(searchPattern: RegExp, replaceTerm: string, flags: string, visibleOnly: boolean): boolean {
    const iframes: NodeListOf<HTMLIFrameElement> = document.querySelectorAll('iframe')
    const otherElements = document.body.getElementsByTagName('*')
    const otherElementsArr: HTMLElement[] = Array.from(otherElements).filter(
        (el) => !el.tagName.match(ELEMENT_FILTER)
    ) as HTMLElement[]

    if (iframes.length === 0) {
        if (visibleOnly) {
            return replaceVisibleOnly(otherElementsArr, searchPattern, replaceTerm, flags)
        } else {
            // when there are no iframes we are free to replace html directly in the body
            return replaceHTMLInBody(document.body as HTMLBodyElement, searchPattern, replaceTerm)
        }
    } else {
        const replaced = replaceHTMLInIframes(iframes, searchPattern, replaceTerm, flags, visibleOnly)
        if (visibleOnly) {
            return replaced || replaceVisibleOnly(otherElementsArr, searchPattern, replaceTerm, flags)
        } else {
            // if there are iframes we take a cautious approach TODO - make this properly replace HTML
            return replaceHTMLInElements(otherElementsArr, searchPattern, replaceTerm, flags)
        }
    }
}

function replaceHTMLInIframes(
    iframes,
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string,
    visibleOnly: boolean
): boolean {
    let replaced = false
    for (let iframeCount = 0; iframeCount < iframes.length; iframeCount++) {
        const iframe = iframes[0]
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            try {
                const content = iframe.contentDocument.documentElement
                if (visibleOnly) {
                    replaced = replaceVisibleOnly(content, searchPattern, replaceTerm, flags)
                } else {
                    replaced = replaceHTMLInBody(content, searchPattern, replaceTerm)
                }
            } catch (e) {
                console.error(e)
            }
        }
    }
    return replaced
}

function replaceHTMLInElements(elements: HTMLElement[], searchPattern, replaceTerm, flags): boolean {
    // replaces in inner html per element in the document
    const filtered = Array.from(elements).filter((el) => !el.tagName.match(ELEMENT_FILTER))
    let replaced = false
    for (const element of filtered) {
        replaced = replaceInInnerHTML(element, searchPattern, replaceTerm)
        if (element.tagName.match(INPUT_TEXTAREA_FILTER)) {
            const ko = usesKnockout()
            replaced = replaceInInput(element as HTMLInputElement, searchPattern, replaceTerm, ko)
        }
        //Replace Next should only match once
        if (replaceNextOnly(flags) && replaced) {
            return true
        }
    }
    return replaced
}

function replaceNextOnly(flags: string): boolean {
    return flags.indexOf(RegexFlags.Global) === -1
}

function replaceVisibleOnly(
    elements: HTMLElement[],
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string
): boolean {
    //replace inner texts first, dropping out if we have done a replacement and are not working globally
    const unhidden: HTMLElement[] = Array.from(elements).filter(elementIsVisible)
    const replaced = replaceInnerText(unhidden, searchPattern, replaceTerm, flags)
    if (replaceNextOnly(flags) && replaced) {
        return replaced
    }
    // then replace inputs
    const inputs: HTMLInputElement[] = unhidden.filter((el) =>
        el.tagName.match(INPUT_TEXTAREA_FILTER)
    ) as HTMLInputElement[]
    return replaceInInputs(inputs, searchPattern, replaceTerm, flags)
}

function elementIsVisible(element: HTMLElement): boolean {
    const styleVisible = element.style.display !== 'none'
    if (element.nodeName === 'INPUT') {
        const inputElement = element as HTMLInputElement
        return inputElement.type !== 'hidden' && styleVisible
    } else {
        return styleVisible
    }
}

// Custom Functions

function replaceGmail(searchPattern: RegExp, replaceTerm: string, flags: string): boolean {
    const inputs = Array.from(
        document.querySelectorAll('div[aria-label="Message Body"], input[name="subjectbox"]')
    ) as HTMLInputElement[]
    return replaceInInputs(inputs, searchPattern, replaceTerm, flags)
}

function cmsEditor(searchPattern: RegExp, replaceTerm: string, flags: string, richTextEditor: RichTextEditor): boolean {
    let replaced = false
    try {
        if (richTextEditor.container && richTextEditor.container.iframe) {
            const container = <HTMLIFrameElement>(
                document.querySelector(richTextEditor.container.value)?.querySelector('iframe')
            )
            const editor: HTMLElement | null | undefined = container?.contentDocument?.querySelector(
                richTextEditor.editor.value
            )
            if (editor) {
                replaced = replaceInInnerHTML(editor, searchPattern, replaceTerm)
            }
        } else {
            const editor = <HTMLElement>document.querySelector(richTextEditor.editor.value)
            const initialText = editor.textContent || ''
            const newText = initialText.replace(searchPattern, replaceTerm)
            replaceInContentEditableElement(editor, newText)
            replaced = initialText !== newText
        }
    } catch (err) {
        console.error(err)
        return replaced
    }
    return replaced
}

// taken from https://stackoverflow.com/a/69656905/1178971
function replaceInContentEditableElement(element: HTMLElement, replacementText: string) {
    const dataTransfer = new DataTransfer()

    // this may be 'text/html' if it's required
    dataTransfer.setData('text/plain', `${replacementText}`)

    // select the content editable area
    element.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

    // select all the text
    selectElementContents(element)

    // delete any text in the content editable area
    element.dispatchEvent(
        new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            keyCode: 46,
            shiftKey: true,
        })
    )

    // wait a short time for the delete to happen
    setTimeout(() => {
        // paste the replacement text
        element.dispatchEvent(
            new ClipboardEvent('paste', {
                clipboardData: dataTransfer,

                // need these for the event to reach Draft paste handler
                bubbles: true,
                cancelable: true,
            })
        )
        // clear DataTransfer Data
        dataTransfer.clearData()
    }, 100)
}

function selectElementContents(el: HTMLElement) {
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
    }
}

function getSearchPattern(searchTerm: string, isRegex: boolean, flags: string, wholeWord: boolean): RegExp {
    const escaped = regExEscape(searchTerm)
    try {
        const searchTermEscaped = isRegex ? searchTerm : escaped
        if (wholeWord && !isRegex) {
            return new RegExp(`\\b${searchTermEscaped}\\b`, flags)
        } else {
            return new RegExp(searchTermEscaped, flags)
        }
    } catch (e) {
        console.warn(`error building regex: ${searchTerm}`)
        return new RegExp(escaped, flags)
    }
}

function getFlags(matchCase: boolean, replaceAll: boolean): string {
    return (replaceAll ? RegexFlags.Global : '') + (matchCase ? '' : RegexFlags.CaseInsensitive)
}

function getSearchOccurrences(searchPattern: RegExp, visibleOnly: boolean): number {
    let matches
    if (visibleOnly) {
        matches = document.body.innerText.match(searchPattern)
        const iframeMatches = Array.from(document.querySelectorAll('iframe'))
            .map((iframe) => (iframe.contentDocument?.documentElement.innerText.match(searchPattern) || []).length)
            .reduce((a, b) => a + b, 0)
        matches += iframeMatches
    } else {
        matches = document.body.innerHTML.match(searchPattern)
    }
    if (matches) {
        return matches.length
    } else {
        return 0
    }
}

function searchReplace(
    searchTerm: string,
    replaceTerm: string,
    flags: string,
    inputFieldsOnly: boolean,
    isRegex: boolean,
    visibleOnly: boolean,
    wholeWord: boolean
): boolean {
    const searchPattern = getSearchPattern(searchTerm, isRegex, flags, wholeWord)

    let replaced = false

    // replacement functions for pages with text editors
    for (const richTextEditor of RICH_TEXT_EDITORS) {
        if (richTextEditor.container) {
            if (document.querySelectorAll(richTextEditor.container.value).length) {
                replaced = cmsEditor(searchPattern, replaceTerm, flags, richTextEditor)
            }
        } else {
            if (document.querySelectorAll(richTextEditor.editor.value).length) {
                replaced = cmsEditor(searchPattern, replaceTerm, flags, richTextEditor)
            }
        }
    }
    // we check other places if text was not replaced in a text editor
    if (!replaced) {
        if (window.location.href.indexOf(GOOGLE_MAIL_DOMAIN) > -1) {
            if (
                window.location.hash.indexOf('compose') > -1 ||
                window.location.hash.indexOf('#drafts') > -1 ||
                window.location.hash.indexOf('#inbox') > -1
            ) {
                return replaceGmail(searchPattern, replaceTerm, flags)
            }
        } else if (inputFieldsOnly) {
            return replaceInputFields(searchPattern, replaceTerm, flags, visibleOnly)
        } else {
            return replaceHTML(searchPattern, replaceTerm, flags, visibleOnly)
        }
    }
    return replaced
}

function inIframe() {
    return window !== window.top
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    const instance = request.instance as SearchReplaceInstance
    const replaceAll = request.replaceAll
    const action = request.action as SearchReplaceAction
    const globalFlags = getFlags(instance.options.matchCase, true)

    const globalSearchPattern = getSearchPattern(
        instance.searchTerm,
        instance.options.isRegex,
        globalFlags,
        instance.options.wholeWord
    )
    if (action === 'searchReplace') {
        sessionStorage.setItem('searchTerm', instance.searchTerm)
        sessionStorage.setItem('replaceTerm', instance.replaceTerm)
        const flags = getFlags(instance.options.matchCase, replaceAll)
        searchReplace(
            instance.searchTerm,
            instance.replaceTerm,
            flags,
            instance.options.inputFieldsOnly,
            instance.options.isRegex,
            instance.options.visibleOnly,
            instance.options.wholeWord
        )
        sendResponse({
            searchTermCount: getSearchOccurrences(globalSearchPattern, instance.options.visibleOnly),
            inIframe: inIframe(),
        })
    } else {
        const searchTermCount = getSearchOccurrences(globalSearchPattern, instance.options.visibleOnly)
        const response = {
            searchTermCount: searchTermCount,
            inIframe: inIframe(),
        }
        sendResponse(response)
    }
})
