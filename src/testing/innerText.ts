// jsdom does not implement `innerText` (it needs layout), but the innerText search path is
// the extension's default mode, so tests would otherwise be unable to cover it at all.
//
// This is an approximation, not a polyfill. It reproduces the two distinctions the search code
// relies on:
//   - `innerText` omits text hidden with `display: none`, whereas `textContent` includes it
//   - block-level elements introduce a line break, so text in sibling blocks does not run
//     together (which matters for whole-word matching, among other things)
// It does not reproduce browser whitespace collapsing, text-transform, or table layout. Tests
// that depend on those belong in the Cypress suite, which runs in a real browser.

/** Elements the browser renders as blocks, which force a line break in innerText */
const BLOCK_ELEMENTS = new Set([
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'BODY',
    'DD',
    'DETAILS',
    'DIALOG',
    'DIV',
    'DL',
    'DT',
    'FIELDSET',
    'FIGCAPTION',
    'FIGURE',
    'FOOTER',
    'FORM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'HGROUP',
    'HR',
    'LI',
    'MAIN',
    'NAV',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'TBODY',
    'TD',
    'TFOOT',
    'TH',
    'THEAD',
    'TR',
    'UL',
])

function isDisplayNone(element: Element): boolean {
    const inlineDisplay = (element as HTMLElement).style?.display
    if (inlineDisplay === 'none') {
        return true
    }
    if (element.nodeName === 'INPUT' && (element as HTMLInputElement).type === 'hidden') {
        return true
    }
    // A detached element (a clone, for instance) has no computed style to consult
    const view = element.ownerDocument.defaultView
    return view ? view.getComputedStyle(element).display === 'none' : false
}

function isBlock(element: Element): boolean {
    return BLOCK_ELEMENTS.has(element.nodeName) || (element as HTMLElement).style?.display === 'block'
}

function visibleText(node: Node): string {
    let text = ''
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.nodeValue ?? ''
            continue
        }
        if (child.nodeType !== Node.ELEMENT_NODE) {
            continue
        }
        const element = child as Element
        if (isDisplayNone(element)) {
            continue
        }
        if (element.nodeName === 'BR') {
            text += '\n'
            continue
        }
        const inner = visibleText(element)
        text += isBlock(element) ? `\n${inner}\n` : inner
    }
    // Browsers collapse runs of line breaks introduced by nested blocks
    return text.replace(/\n{2,}/g, '\n')
}

export function installInnerTextShim() {
    if ('innerText' in HTMLElement.prototype) {
        return
    }
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
        configurable: true,
        get(this: HTMLElement) {
            return visibleText(this).replace(/^\n+|\n+$/g, '')
        },
        set(this: HTMLElement, value: string) {
            this.textContent = value
        },
    })
}
