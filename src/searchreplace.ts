'use strict'
import { RegexFlags, RichTextEditor, SearchReplaceMessage } from './types/index'
import { elementIsVisible, getIframeElements, getInputElements, getSearchOccurrences, inIframe } from './util'
import { getHints } from './hints'
import { ELEMENT_FILTER, INPUT_TEXTAREA_FILTER, RICH_TEXT_EDITORS } from './constants'
import { getFlags, getSearchPattern } from './regex'

function replaceInInnerHTML(element: HTMLElement, searchPattern: RegExp, replaceTerm: string) {
    const searchStr = element.innerHTML
    element.innerHTML = searchStr.replace(searchPattern, replaceTerm)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    return !(element.innerHTML === searchStr)
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
    document: Document,
    input: HTMLInputElement | HTMLTextAreaElement,
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

function replaceInnerText(
    document: Document,
    elements: HTMLElement[],
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string
) {
    let replaced = false
    for (const element of elements) {
        if (element.innerText !== undefined) {
            if (element.innerText.match(searchPattern)) {
                replaced = replaceInTextNodes(document, element, searchPattern, replaceTerm, flags)
                if (flags === RegexFlags.CaseInsensitive) {
                    return replaced
                }
            }
        }
    }
    return replaced
}

function replaceInTextNodes(
    document: Document,
    element: HTMLElement,
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string
) {
    let replaced = false
    const textNodes = textNodesUnder(document, element)
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

function textNodesUnder(document: Document, element: Node) {
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
    document: Document,
    inputs: (HTMLInputElement | HTMLTextAreaElement)[],
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string
): boolean {
    let replaced = false
    const ko = usesKnockout(document)
    for (const input of inputs) {
        replaced = replaceInInput(document, input, searchPattern, replaceTerm, ko)
        if (flags === RegexFlags.CaseInsensitive && replaced) {
            return replaced
        }
    }
    return replaced
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
    document: Document,
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string,
    visibleOnly: boolean
): boolean {
    const iframes = getIframeElements(document)
    const allInputs = getInputElements(document, visibleOnly)
    const replaced = replaceInInputs(document, allInputs, searchPattern, replaceTerm, flags)
    if (flags === RegexFlags.CaseInsensitive && replaced) {
        return replaced
    }

    for (let iframeCount = 0; iframeCount < iframes.length; iframeCount++) {
        const iframe = iframes[0]
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            const iframeInputs = getInputElements(iframe.contentDocument!, visibleOnly)
            const replaced = replaceInInputs(document, iframeInputs, searchPattern, replaceTerm, flags)
            if (replaceNextOnly(flags) && replaced) {
                return replaced
            }
        }
    }
    return false
}

function replaceHTML(
    document: Document,
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string,
    visibleOnly: boolean
): boolean {
    const iframes: NodeListOf<HTMLIFrameElement> = document.querySelectorAll('iframe')
    const otherElements = document.body.getElementsByTagName('*')
    const otherElementsArr: HTMLElement[] = Array.from(otherElements).filter(
        (el) => !el.tagName.match(ELEMENT_FILTER)
    ) as HTMLElement[]

    if (iframes.length === 0) {
        if (visibleOnly) {
            return replaceVisibleOnly(document, otherElementsArr, searchPattern, replaceTerm, flags)
        } else {
            // when there are no iframes we are free to replace html directly in the body
            return replaceHTMLInBody(document.body as HTMLBodyElement, searchPattern, replaceTerm)
        }
    } else {
        const replaced = replaceHTMLInIframes(document, iframes, searchPattern, replaceTerm, flags, visibleOnly)
        if (visibleOnly) {
            return replaced || replaceVisibleOnly(document, otherElementsArr, searchPattern, replaceTerm, flags)
        } else {
            // if there are iframes we take a cautious approach TODO - make this properly replace HTML
            return replaceHTMLInElements(document, otherElementsArr, searchPattern, replaceTerm, flags)
        }
    }
}

function replaceHTMLInIframes(
    document: Document,
    iframes: NodeListOf<HTMLIFrameElement>,
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string,
    visibleOnly: boolean
): boolean {
    let replaced = false
    for (const iframe of iframes) {
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            try {
                const content = iframe.contentDocument?.body as HTMLBodyElement
                if (visibleOnly) {
                    replaced = replaceVisibleOnly(document, [content], searchPattern, replaceTerm, flags)
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

function replaceHTMLInElements(
    document: Document,
    elements: HTMLElement[],
    searchPattern,
    replaceTerm,
    flags
): boolean {
    // replaces in inner html per element in the document
    const filtered = Array.from(elements).filter((el) => !el.tagName.match(ELEMENT_FILTER))
    let replaced = false
    for (const element of filtered) {
        replaced = replaceInInnerHTML(element, searchPattern, replaceTerm)
        if (element.tagName.match(INPUT_TEXTAREA_FILTER)) {
            const ko = usesKnockout(document)
            replaced = replaceInInput(document, element as HTMLInputElement, searchPattern, replaceTerm, ko)
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
    document: Document,
    elements: HTMLElement[],
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string
): boolean {
    //replace inner texts first, dropping out if we have done a replacement and are not working globally
    const unhidden: HTMLElement[] = Array.from(elements).filter(elementIsVisible)
    const replaced = replaceInnerText(document, unhidden, searchPattern, replaceTerm, flags)
    if (replaceNextOnly(flags) && replaced) {
        return replaced
    }
    // then replace inputs
    const inputs: HTMLInputElement[] = unhidden.filter((el) =>
        el.tagName.match(INPUT_TEXTAREA_FILTER)
    ) as HTMLInputElement[]
    return replaceInInputs(document, inputs, searchPattern, replaceTerm, flags)
}

// Custom Functions

async function cmsEditor(
    document: Document,
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string,
    richTextEditor: RichTextEditor
): Promise<boolean> {
    let replaced = false
    try {
        if (richTextEditor.container && richTextEditor.container.iframe) {
            const containerOuter = document.querySelector(richTextEditor.container.value)
            // if container is an iframe use it, otherwise search inside for an iframe
            const container: HTMLIFrameElement | null | undefined =
                containerOuter && containerOuter?.tagName === 'IFRAME'
                    ? <HTMLIFrameElement>containerOuter
                    : <HTMLIFrameElement>containerOuter?.querySelector('iframe')
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
            await replaceInContentEditableElement(editor, initialText, newText)
            replaced = initialText !== newText
        }
    } catch (err) {
        console.error(err)
        return replaced
    }

    return replaced
}

// taken from https://stackoverflow.com/a/69656905/1178971
async function replaceInContentEditableElement(
    element: HTMLElement,
    initialText: string,
    replacementText: string
): Promise<boolean> {
    return new Promise((resolve) => {
        // select the content editable area
        element.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
        if (element.innerText === element.innerHTML) {
            element.textContent = replacementText
        } else {
            element.innerHTML = element.innerHTML.replace(initialText, replacementText)
        }

        element.dispatchEvent(new Event('input', { bubbles: true }))

        resolve(element.innerText !== initialText)
    })
}

function selectElementContents(window: Window, el: HTMLElement) {
    const range = window.document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
    }
}

async function replaceInCMSEditors(
    document: Document,
    searchPattern: RegExp,
    replaceTerm: string,
    flags: string,
    visibleOnly: boolean
): Promise<boolean> {
    let replaced = false
    // replacement functions for pages with text editors
    for (const richTextEditor of RICH_TEXT_EDITORS) {
        if (richTextEditor.container) {
            if (document.querySelectorAll(richTextEditor.container.value).length) {
                replaced = await cmsEditor(document, searchPattern, replaceTerm, flags, richTextEditor)
            }
        } else {
            if (document.querySelectorAll(richTextEditor.editor.value).length) {
                replaced = await cmsEditor(document, searchPattern, replaceTerm, flags, richTextEditor)
            }
        }
    }

    return replaced
}

export async function searchReplace(
    window: Window,
    searchTerm: string,
    replaceTerm: string,
    flags: string,
    inputFieldsOnly: boolean,
    isRegex: boolean,
    visibleOnly: boolean,
    wholeWord: boolean
): Promise<boolean> {
    const searchPattern = getSearchPattern(searchTerm, isRegex, flags, wholeWord)
    const document = window.document
    let replaced = false

    // replacement functions for pages with text editors
    replaced = await replaceInCMSEditors(document, searchPattern, replaceTerm, flags, visibleOnly)

    if (replaceNextOnly(flags) && replaced) {
        return replaced
    }

    // TODO loop everything over document and then iframes
    // replacement functions for iframes with rich text editors
    const iframes = getIframeElements(document)
    for (const iframe of iframes) {
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            const richTextEditors = RICH_TEXT_EDITORS.filter((editor) => editor.container?.iframe)
            replaced = await replaceInCMSEditors(
                iframe.contentDocument!,
                searchPattern,
                replaceTerm,
                flags,
                visibleOnly
            )
            if (replaceNextOnly(flags) && replaced) {
                return replaced
            }
        }
    }

    // Check to see if the search term is still present
    const searchTermPresentAndGlobalSearch =
        getSearchOccurrences(document, searchPattern, visibleOnly) > 0 && flags.indexOf(RegexFlags.Global) > -1

    // we check other places if text was not replaced in a text editor
    if (!replaced || searchTermPresentAndGlobalSearch) {
        if (inputFieldsOnly) {
            return replaceInputFields(document, searchPattern, replaceTerm, flags, visibleOnly)
        } else {
            return replaceHTML(document, searchPattern, replaceTerm, flags, visibleOnly)
        }
    }
    return replaced
}

if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (request: SearchReplaceMessage, sender, sendResponse) {
        const instance = request.instance
        const replaceAll = instance.options.replaceAll
        const action = request.action
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
                window,
                instance.searchTerm,
                instance.replaceTerm,
                flags,
                instance.options.inputFieldsOnly,
                instance.options.isRegex,
                instance.options.visibleOnly,
                instance.options.wholeWord
            ).then((replaced) => {
                sendResponse({
                    searchTermCount: getSearchOccurrences(
                        document,
                        globalSearchPattern,
                        instance.options.visibleOnly,
                        instance.options.inputFieldsOnly
                    ),
                    inIframe: inIframe(),
                    replaced: replaced,
                })
            })
        } else {
            const searchTermCount = getSearchOccurrences(
                document,
                globalSearchPattern,
                instance.options.visibleOnly,
                instance.options.inputFieldsOnly
            )
            const response = {
                searchTermCount: searchTermCount,
                inIframe: inIframe(),
                hints: getHints(document),
            }
            sendResponse(response)
        }
    })
}
