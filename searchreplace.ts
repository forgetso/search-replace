'use strict';

const ELEMENT_FILTER = new RegExp('(HTML|HEAD|SCRIPT|BODY|STYLE|IFRAME)');
const INPUT_TEXTAREA_FILTER = new RegExp('(INPUT|TEXTAREA)')
const GOOGLE_MAIL_DOMAIN = 'mail.google.com';
const TINY_MCE_ELEMENT_ID = 'tinymce';

function regExEscape(text: string): string {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function replaceInInnerHTML(element: HTMLElement, searchPattern: RegExp, replaceTerm: string) {
    const searchStr = element.innerHTML;
    element.innerHTML = searchStr.replace(searchPattern, replaceTerm);
    return !(element.innerHTML === searchStr)

}


function replaceInInput(input: HTMLInputElement, searchPattern: RegExp, replaceTerm: string, usesKnockout: boolean): boolean {
    if (input.value === undefined) {
        return false
    }

    const oldValue = input.value;
    const newValue = input.value.replace(searchPattern, replaceTerm);

    if (oldValue === newValue) {
        return false
    }

    input.focus();
    input.value = newValue

    if (usesKnockout) {
        const knockoutValueChanger = getKnockoutValueChanger(input.id, newValue);
        document.documentElement.setAttribute('onreset', knockoutValueChanger);
        document.documentElement.dispatchEvent(new CustomEvent('reset'));
        document.documentElement.removeAttribute('onreset');
    }

    input.blur();

    return true
}

function replaceInnerText(elements: HTMLElement[], searchPattern: RegExp, replaceTerm: string, flags: string) {
    let replaced = false;
    for (const element of elements) {
        if (element.innerText !== undefined) {

            if (element.innerText.match(searchPattern)) {
                replaced = replaceInTextNodes(element, searchPattern, replaceTerm, flags)
                if (flags === 'i') {
                    return replaced
                }
            }
        }
    }
    return replaced
}

function replaceInTextNodes(element: HTMLElement, searchPattern: RegExp, replaceTerm: string, flags: string) {
    let replaced = false;
    let textNodes = textNodesUnder(element)
    for (const node of textNodes) {
        let oldValue = node.nodeValue;
        node.nodeValue = node.nodeValue!.replace(searchPattern, replaceTerm);
        replaced = oldValue !== node.nodeValue;
        if (flags === 'i' && replaced) {
            return replaced
        }
    }
    return replaced
}

function textNodesUnder(element: Node) {
    let node: Node | null
    let nodes: Node[] = [];
    let walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    while (node = walk.nextNode()) {
        if (node) {
            nodes.push(node);
        }
    }
    return nodes;
}


function replaceHTMLInBody(body: HTMLBodyElement, searchPattern: RegExp, replaceTerm: string) {
    body.innerHTML = body.innerHTML.replace(searchPattern, replaceTerm);
}

function replaceInInputs(inputs: HTMLInputElement[], searchPattern: RegExp, replaceTerm: string, flags: string) {
    let replaced = false;
    let ko = usesKnockout();
    for (const input of inputs) {
        replaced = replaceInInput(input, searchPattern, replaceTerm, ko);
        if (flags === 'i' && replaced) {
            return replaced
        }
    }
    return replaced
}

function usesKnockout(): boolean {
    const script = Array.from(document.getElementsByTagName('script')).filter(s => s.src.indexOf('knockout.js') > -1)
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
            })()`;
}


function replaceInputFields(searchPattern: RegExp, replaceTerm: string, flags: string, visibleOnly: boolean) {
    const iframes = document.querySelectorAll('iframe');
    let allInputs: NodeListOf<HTMLInputElement | HTMLTextAreaElement> = document.querySelectorAll('input, textarea');
    const inputTypeFilter: string[] = [];
    if (visibleOnly) {
        inputTypeFilter.push("hidden")
    }
    let allInputsArr: HTMLInputElement[] = Array.from(allInputs).filter(({type}) => inputTypeFilter.indexOf(type) === -1) as HTMLInputElement[];
    let replaced = replaceInInputs(allInputsArr, searchPattern, replaceTerm, flags)
    if (flags === 'i' && replaced) {
        return replaced
    }

    for (let iframeCount = 0; iframeCount < iframes.length; iframeCount++) {
        let iframe = iframes[0];
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            let iframeInputs: NodeListOf<HTMLInputElement | HTMLTextAreaElement> = document.querySelectorAll('input, textarea');
            let iframeInputsArr: HTMLInputElement[] = Array.from(iframeInputs).filter(({type}) => inputTypeFilter.indexOf(type) === -1) as HTMLInputElement[];
            let replaced = replaceInInputs(iframeInputsArr, searchPattern, replaceTerm, flags)
            if (replaceNextOnly(flags) && replaced) {
                return replaced
            }
        }
    }
}

function replaceHTML(searchPattern: RegExp, replaceTerm: string, flags: string, visibleOnly: boolean) {
    const iframes: NodeListOf<HTMLIFrameElement> = document.querySelectorAll('iframe');
    let otherElements = document.body.getElementsByTagName('*');
    let otherElementsArr: HTMLElement[] = Array.from(otherElements).filter(el => !el.tagName.match(ELEMENT_FILTER)) as HTMLElement[];


    if (iframes.length === 0) {

        if (visibleOnly) {
            replaceVisibleOnly(otherElementsArr, searchPattern, replaceTerm, flags)
        } else {
            // when there are no iframes we are free to replace html directly in the body
            replaceHTMLInBody(document.body as HTMLBodyElement, searchPattern, replaceTerm)
        }

    } else {

        replaceHTMLInIframes(iframes, searchPattern, replaceTerm, flags, visibleOnly)
        if (visibleOnly) {
            replaceVisibleOnly(otherElementsArr, searchPattern, replaceTerm, flags)
        } else {
            // if there are iframes we take a cautious approach TODO - make this properly replace HTML
            replaceHTMLInElements(otherElementsArr, searchPattern, replaceTerm, flags);
        }
    }
}

function replaceHTMLInIframes(iframes, searchPattern: RegExp, replaceTerm: string, flags: string, visibleOnly: boolean) {
    for (let iframeCount = 0; iframeCount < iframes.length; iframeCount++) {
        let iframe = iframes[0];
        if (iframe.src.match('^http://' + window.location.host) || !iframe.src.match('^https?')) {
            try {
                let content = iframe.contentDocument.documentElement;
                if (visibleOnly) {
                    replaceVisibleOnly(content, searchPattern, replaceTerm, flags);
                } else {
                    replaceHTMLInBody(content, searchPattern, replaceTerm)
                }
            } catch (e) {
                console.log(e);
                console.log('error replacing in iframe');
            }
        }
    }
}

function replaceHTMLInElements(elements: HTMLElement[], searchPattern, replaceTerm, flags) {
    // replaces in inner html per element in the document
    const filtered = Array.from(elements).filter(el => !el.tagName.match(ELEMENT_FILTER));
    let replaced = false;
    for (const element of filtered) {
        replaced = replaceInInnerHTML(element, searchPattern, replaceTerm);
        if (element.tagName.match(INPUT_TEXTAREA_FILTER)) {
            const ko = usesKnockout();
            replaced = replaceInInput(element as HTMLInputElement, searchPattern, replaceTerm, ko);
        }
        //Replace Next should only match once
        if (replaceNextOnly(flags) && replaced) {
            return
        }

    }
}

function replaceNextOnly(flags: string): boolean {
    return flags.indexOf('g') === -1;
}

function replaceVisibleOnly(elements: HTMLElement[], searchPattern: RegExp, replaceTerm: string, flags: string) {

    //replace inner texts first, dropping out if we have done a replacement and are not working globally
    const unhidden: HTMLElement[] = Array.from(elements).filter(elementIsVisible);
    let replaced = replaceInnerText(unhidden, searchPattern, replaceTerm, flags);
    if (replaceNextOnly(flags) && replaced) {
        return
    }
    // then replace inputs
    const inputs: HTMLInputElement[] = unhidden.filter(el => el.tagName.match(INPUT_TEXTAREA_FILTER)) as HTMLInputElement[];
    let _ = replaceInInputs(inputs, searchPattern, replaceTerm, flags);

}

function elementIsVisible(element: HTMLElement): boolean {
    const styleVisible = element.style.display !== 'none'
    if (element.nodeName === 'INPUT') {
        const inputElement = element as HTMLInputElement;
        return inputElement.type !== 'hidden' && styleVisible
    } else {
        return styleVisible
    }
}


// Custom Functions

function replaceGmail(searchPattern: RegExp, replaceTerm: string, flags: string) {
    let inputs = Array.from(document.querySelectorAll('div[aria-label="Message Body"], input[name="subjectbox"]')) as HTMLInputElement[];
    replaceInInputs(inputs, searchPattern, replaceTerm, flags);
}

function tinyMCEPostEdit(searchPattern: RegExp, replaceTerm: string, flags: string) {
    try {
        const mceIframe: HTMLIFrameElement = <HTMLIFrameElement>document.querySelectorAll('.mce-edit-area')[0].childNodes[0];
        const mceIframeBody = mceIframe.contentDocument!.getElementById(TINY_MCE_ELEMENT_ID);
        let inputs: HTMLElement[] = [];
        if (mceIframeBody) {
            console.log("Found mce iframe body")
            inputs.push(mceIframeBody);
            // TODO work out which function to use here
            replaceInnerText(inputs, searchPattern, replaceTerm, flags);
            mceIframeBody.focus();
        }

    } catch (err) {
        console.log(err);
    }

}

function getSearchPattern(searchTerm: string, isRegex: boolean, flags: string, wholeWord: boolean): RegExp {
    const escaped = regExEscape(searchTerm)
    try {
        const searchTermEscaped = isRegex ? searchTerm : escaped;
        if (wholeWord && !isRegex) {
            return new RegExp(`\\b${searchTermEscaped}\\b`, flags);
        } else {
            return new RegExp(searchTermEscaped, flags);
        }
    } catch (e) {
        console.warn(`error building regex: ${searchTerm}`)
        return new RegExp(escaped, flags);
    }
}

function getFlags(matchCase: boolean, replaceAll: boolean): string {
    return (replaceAll ? 'g' : '') + (matchCase ? '' : 'i');
}

function getSearchOccurrences(searchPattern: RegExp, visibleOnly: boolean): number {
    let matches;
    if (visibleOnly) {
        matches = document.body.innerText.match(searchPattern);
    } else {
        matches = document.body.innerHTML.match(searchPattern);
    }
    if (matches) {
        return matches.length;
    } else {
        return 0;
    }
}

function searchReplace(searchTerm: string, replaceTerm: string, flags: string, inputFieldsOnly: boolean, isRegex: boolean, visibleOnly: boolean, wholeWord: boolean): void {

    const searchPattern = getSearchPattern(searchTerm, isRegex, flags, wholeWord);

    if (document.querySelectorAll('.mce-tinymce').length) {
        console.log("found tinymce")
        tinyMCEPostEdit(searchPattern, replaceTerm, flags);
        replaceInputFields(searchPattern, replaceTerm, flags, visibleOnly)
    } else if (window.location.href.indexOf(GOOGLE_MAIL_DOMAIN) > -1) {
        if (window.location.hash.indexOf('compose') > -1 || window.location.hash.indexOf('#drafts') > -1 || window.location.hash.indexOf('#inbox') > -1) {
            replaceGmail(searchPattern, replaceTerm, flags)
        }
    } else if (inputFieldsOnly) {
        replaceInputFields(searchPattern, replaceTerm, flags, visibleOnly)
    } else {
        replaceHTML(searchPattern, replaceTerm, flags, visibleOnly)
    }

}

function inIframe() {
    return window !== window.top
}

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        const globalFlags = getFlags(request.matchCase, true)
        const globalSearchPattern = getSearchPattern(request.searchTerm, request.regex, globalFlags, request.wholeWord)
        let searchTermCount = getSearchOccurrences(globalSearchPattern, request.visibleOnly)
        const response = {
            searchTermCount: searchTermCount,
            inIframe: inIframe()
        }
        if (request.action === 'searchReplace') {
            sessionStorage.setItem('searchTerm', request.searchTerm);
            sessionStorage.setItem('replaceTerm', request.replaceTerm);
            const flags = getFlags(request.matchCase, request.replaceAll);
            searchReplace(request.searchTerm, request.replaceTerm, flags, request.inputFieldsOnly, request.regex, request.visibleOnly, request.wholeWord);
            sendResponse({
                searchTermCount: getSearchOccurrences(globalSearchPattern, request.visibleOnly),
                inIframe: inIframe()
            });
        } else {
            sendResponse(response);
        }
    });
