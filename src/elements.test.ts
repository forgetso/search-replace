import { SearchReplaceResult } from './types'
import { beforeEach, describe, expect, test } from 'vitest'
import {
    containsPartialClass,
    copyElementAndRemoveSelectedElements,
    elementIsVisible,
    getBlobIframes,
    getInitialIframeElement,
    getInputElements,
    getLocalIframes,
    getRespondingIframes,
    isBlobIframe,
    isEditable,
    isHidden,
    isInputElement,
    isWYSIWYGEditorIframe,
} from './elements'

function setBody(html: string) {
    document.body.innerHTML = html
}

/** `elementsChecked` is threaded through the search as a map; most tests start with it empty */
function noneChecked() {
    return new Map<Element, SearchReplaceResult>()
}

beforeEach(() => {
    setBody('')
})

describe('isInputElement', () => {
    test('accepts inputs and textareas', () => {
        setBody('<input id="i"><textarea id="t"></textarea>')
        expect(isInputElement(document.getElementById('i') as Element)).toBe(true)
        expect(isInputElement(document.getElementById('t') as Element)).toBe(true)
    })

    test('accepts a div that is explicitly contenteditable', () => {
        setBody('<div id="d" contenteditable="true"></div>')
        expect(isInputElement(document.getElementById('d') as Element)).toBe(true)
    })

    test('rejects contenteditable="false"', () => {
        setBody('<div id="d" contenteditable="false"></div>')
        expect(isInputElement(document.getElementById('d') as Element)).toBe(false)
    })

    test('rejects an ordinary div', () => {
        setBody('<div id="d"></div>')
        expect(isInputElement(document.getElementById('d') as Element)).toBe(false)
    })
})

describe('isEditable', () => {
    test('accepts an element marked contenteditable', () => {
        setBody('<div id="d" contenteditable="true">x</div>')
        expect(isEditable(document.getElementById('d') as Element)).toBe(true)
    })

    test('accepts a valueless contenteditable attribute, which means true', () => {
        setBody('<div id="d" contenteditable>x</div>')
        expect(isEditable(document.getElementById('d') as Element)).toBe(true)
    })

    test('accepts a descendant of a contenteditable container', () => {
        // Descendants are editable but carry no attribute, so an attribute-only check misses them
        setBody('<div contenteditable="true"><p><span id="d">x</span></p></div>')
        expect(isEditable(document.getElementById('d') as Element)).toBe(true)
    })

    test('respects contenteditable="false" nested inside an editable container', () => {
        setBody('<div contenteditable="true"><div id="d" contenteditable="false">x</div></div>')
        expect(isEditable(document.getElementById('d') as Element)).toBe(false)
    })

    test('rejects an ordinary element', () => {
        setBody('<div><span id="d">x</span></div>')
        expect(isEditable(document.getElementById('d') as Element)).toBe(false)
    })
})

describe('isBlobIframe', () => {
    test('accepts an iframe with a blob src', () => {
        setBody('<iframe id="f" src="blob:https://example.com/abc"></iframe>')
        expect(isBlobIframe(document.getElementById('f') as Element)).toBe(true)
    })

    test('rejects an iframe with an http src', () => {
        setBody('<iframe id="f" src="https://example.com/"></iframe>')
        expect(isBlobIframe(document.getElementById('f') as Element)).toBe(false)
    })

    test('rejects a non-iframe even if it has a blob src', () => {
        setBody('<img id="i" src="blob:https://example.com/abc">')
        expect(isBlobIframe(document.getElementById('i') as Element)).toBe(false)
    })
})

describe('containsPartialClass', () => {
    test('matches a class by substring', () => {
        setBody('<div id="d" class="foo mce-edit-area-x bar"></div>')
        expect(containsPartialClass(document.getElementById('d') as Element, 'mce-edit-area')).toBe(true)
    })

    test('does not match an absent class', () => {
        setBody('<div id="d" class="foo"></div>')
        expect(containsPartialClass(document.getElementById('d') as Element, 'tinymce')).toBe(false)
    })
})

describe('isWYSIWYGEditorIframe', () => {
    test('recognises a known editor class', () => {
        setBody('<iframe id="f" class="mce-edit-area"></iframe>')
        expect(isWYSIWYGEditorIframe(document.getElementById('f') as Element)).toBe(true)
    })

    test('recognises the Gutenberg editor canvas by name', () => {
        setBody('<iframe id="f" name="editor-canvas"></iframe>')
        expect(isWYSIWYGEditorIframe(document.getElementById('f') as Element)).toBe(true)
    })

    test('rejects an unrelated iframe', () => {
        setBody('<iframe id="f" class="advert" name="ad-slot"></iframe>')
        expect(isWYSIWYGEditorIframe(document.getElementById('f') as Element)).toBe(false)
    })
})

describe('isHidden', () => {
    test('always treats the body as visible', () => {
        // The body is the starting point of the search, so it must never be filtered out
        document.body.setAttribute('style', 'display: none;')
        expect(isHidden(document.body)).toBe(false)
    })

    test('treats a hidden input as hidden', () => {
        setBody('<input id="i" type="hidden" value="x">')
        expect(isHidden(document.getElementById('i') as Element)).toBe(true)
    })

    test('treats a text input as visible', () => {
        setBody('<input id="i" type="text" value="x">')
        expect(isHidden(document.getElementById('i') as Element)).toBe(false)
    })

    test('treats display:none as hidden', () => {
        setBody('<div id="d" style="display: none;">x</div>')
        expect(isHidden(document.getElementById('d') as Element)).toBe(true)
    })

    test('treats display:contents as visible', () => {
        // checkVisibility used to report display:contents as invisible, so it is special-cased
        setBody('<div id="d" style="display: contents;">x</div>')
        expect(isHidden(document.getElementById('d') as Element)).toBe(false)
    })

    test('treats an unstyled element as visible', () => {
        setBody('<div id="d">x</div>')
        expect(isHidden(document.getElementById('d') as Element)).toBe(false)
    })
})

describe('elementIsVisible', () => {
    test('reports an element inside a hidden parent as invisible', () => {
        setBody('<div style="display: none;"><div id="child">x</div></div>')
        expect(elementIsVisible(document.getElementById('child') as HTMLElement)).toBe(false)
    })

    test('reports an element inside a hidden grandparent as invisible', () => {
        setBody('<div style="display: none;"><div><div id="child">x</div></div></div>')
        expect(elementIsVisible(document.getElementById('child') as HTMLElement)).toBe(false)
    })

    test('ignores hidden ancestors when the ancestor check is skipped', () => {
        // Inputs are checked without the ancestor walk, which is cheaper but less accurate
        setBody('<div style="display: none;"><div id="child">x</div></div>')
        expect(elementIsVisible(document.getElementById('child') as HTMLElement, false)).toBe(true)
    })

    test('reports a visible element as visible', () => {
        setBody('<div><div id="child">x</div></div>')
        expect(elementIsVisible(document.getElementById('child') as HTMLElement)).toBe(true)
    })
})

describe('getInputElements', () => {
    test('returns inputs, textareas and contenteditable elements', () => {
        setBody(`
            <input id="text" type="text" value="a">
            <textarea id="area">b</textarea>
            <div id="editor" contenteditable="true">c</div>
            <div id="plain">d</div>
        `)
        const ids = getInputElements(document, noneChecked(), true).map((el) => el.id)
        expect(ids).toEqual(['text', 'area', 'editor'])
    })

    test('excludes hidden inputs unless hidden content is requested', () => {
        setBody(`
            <input id="visible" type="text" value="a">
            <input id="invisible" type="hidden" value="b">
        `)
        expect(getInputElements(document, noneChecked(), false).map((el) => el.id)).toEqual(['visible'])
        expect(getInputElements(document, noneChecked(), true).map((el) => el.id)).toEqual(['visible', 'invisible'])
    })

    test('excludes elements that have already been checked', () => {
        setBody('<input id="a" type="text"><input id="b" type="text">')
        const checked = noneChecked()
        checked.set(document.getElementById('a') as Element, { count: { original: 0, replaced: 0 }, replaced: false })
        expect(getInputElements(document, checked, true).map((el) => el.id)).toEqual(['b'])
    })

    test('can be scoped to a subtree', () => {
        setBody('<div id="scope"><input id="inside"></div><input id="outside">')
        const scope = document.getElementById('scope') as HTMLElement
        expect(getInputElements(scope, noneChecked(), true).map((el) => el.id)).toEqual(['inside'])
    })
})

describe('getLocalIframes', () => {
    test('returns only same-page iframes', () => {
        setBody(`
            <iframe id="empty"></iframe>
            <iframe id="blank" src="about:blank"></iframe>
            <iframe id="srcdoc" srcdoc="<p>hi</p>"></iframe>
            <iframe id="remote" src="https://other.example.com/"></iframe>
        `)
        const ids = getLocalIframes(window, document).map((f) => f.id)
        expect(ids).toEqual(['empty', 'blank', 'srcdoc'])
    })
})

describe('getBlobIframes', () => {
    test('returns only blob iframes', () => {
        setBody(`
            <iframe id="blob" src="blob:https://example.com/abc"></iframe>
            <iframe id="remote" src="https://example.com/"></iframe>
        `)
        expect(getBlobIframes(document).map((f) => f.id)).toEqual(['blob'])
    })
})

describe('getRespondingIframes', () => {
    test('excludes iframes that cannot host a content script or would double-count', () => {
        // Only same-origin, non-blob, non-editor iframes run our content script and reply
        setBody(`
            <iframe id="same" src="${window.location.origin}/frame.html"></iframe>
            <iframe id="cross" src="https://other.example.com/frame.html"></iframe>
            <iframe id="extension" src="chrome-extension://abc/frame.html"></iframe>
            <iframe id="blob" src="blob:${window.location.origin}/abc"></iframe>
            <iframe id="editor" class="mce-edit-area"></iframe>
            <iframe id="nosrc"></iframe>
        `)
        expect(getRespondingIframes(window, document).map((f) => f.id)).toEqual(['same'])
    })

    test('still counts an editor iframe that loads its own same-origin document', () => {
        // The editor exclusion runs through getLocalIframes, so it only covers editors with
        // no src / about:blank / srcdoc. An editor with a real same-origin src hosts its own
        // content script and replies for itself, so counting it here is correct.
        setBody(`<iframe id="editor" class="mce-edit-area" src="${window.location.origin}/editor.html"></iframe>`)
        expect(getRespondingIframes(window, document).map((f) => f.id)).toEqual(['editor'])
    })

    test('returns nothing on gmail, which uses many iframes we must not wait on', () => {
        setBody(`
            <meta content="Gmail">
            <iframe id="same" src="${window.location.origin}/frame.html"></iframe>
        `)
        expect(getRespondingIframes(window, document)).toEqual([])
    })
})

describe('getInitialIframeElement', () => {
    test('returns the iframe itself when it has srcdoc, as that is what gets replaced', () => {
        setBody('<iframe id="f" srcdoc="<p>hi</p>"></iframe>')
        const iframe = document.getElementById('f') as HTMLIFrameElement
        expect(getInitialIframeElement(iframe)).toBe(iframe)
    })

    test('returns the body of a same-origin iframe document', () => {
        setBody('<iframe id="f"></iframe>')
        const iframe = document.getElementById('f') as HTMLIFrameElement
        expect(getInitialIframeElement(iframe)).toBe(iframe.contentDocument?.body)
    })
})

describe('copyElementAndRemoveSelectedElements', () => {
    test('removes matching descendants from a clone and leaves the original intact', () => {
        setBody('<div id="root"><p class="keep">a</p><p class="drop">b</p></div>')
        const root = document.getElementById('root') as HTMLElement

        const { clonedElementRemoved, removedSet } = copyElementAndRemoveSelectedElements(
            root,
            (el) => el.classList.contains('drop'),
            true
        )

        expect(clonedElementRemoved.querySelectorAll('.drop')).toHaveLength(0)
        expect(clonedElementRemoved.querySelectorAll('.keep')).toHaveLength(1)
        expect(removedSet.size).toBe(1)
        // the original must be untouched, as it is the element we later replace text in
        expect(root.querySelectorAll('.drop')).toHaveLength(1)
    })

    test('mutates the element in place when clone is false', () => {
        setBody('<div id="root"><p class="drop">b</p></div>')
        const root = document.getElementById('root') as HTMLElement

        const { clonedElementRemoved } = copyElementAndRemoveSelectedElements(
            root,
            (el) => el.classList.contains('drop'),
            false
        )

        expect(clonedElementRemoved).toBe(root)
        expect(root.querySelectorAll('.drop')).toHaveLength(0)
    })

    test('removes matching elements nested several levels deep', () => {
        setBody('<div id="root"><div><div><span class="drop">b</span></div></div></div>')
        const root = document.getElementById('root') as HTMLElement

        const { clonedElementRemoved } = copyElementAndRemoveSelectedElements(
            root,
            (el) => el.classList.contains('drop'),
            true
        )

        expect(clonedElementRemoved.querySelectorAll('.drop')).toHaveLength(0)
    })

    test('keeps everything when nothing matches', () => {
        setBody('<div id="root"><p>a</p><p>b</p></div>')
        const root = document.getElementById('root') as HTMLElement

        const { clonedElementRemoved, removedSet } = copyElementAndRemoveSelectedElements(root, () => false, true)

        expect(clonedElementRemoved.querySelectorAll('p')).toHaveLength(2)
        expect(removedSet.size).toBe(0)
    })

    test('drops hidden elements, which is how the HTML search skips them', () => {
        setBody(`
            <div id="root">
                <div>visible</div>
                <div style="display: none;" class="hidden">hidden</div>
            </div>
        `)
        const root = document.getElementById('root') as HTMLElement

        const { clonedElementRemoved } = copyElementAndRemoveSelectedElements(
            root,
            (el) => !elementIsVisible(el, true, true),
            true
        )

        expect(clonedElementRemoved.querySelectorAll('.hidden')).toHaveLength(0)
        expect(clonedElementRemoved.textContent).toContain('visible')
        expect(clonedElementRemoved.textContent).not.toContain('hidden')
    })
})
