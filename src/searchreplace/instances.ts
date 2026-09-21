// One pass over the page producing the list of places the search term was found, which both
// counting and replacing then work from.
//
// Counting and replacing used to be two separate walks: counting measured an element's
// `innerHTML` as a string, replacing drove a TreeWalker. They disagreed, and the disagreement
// was visible — a page with a match in a script and one in a style reported 2 matches and
// replaced 4, so pressing Replace Next appeared to stall on the ones the count had never
// admitted to. The two cannot be reconciled by patching either side, because an `innerHTML`
// string cannot express scope: the text of a hidden element, of a script, and of an input are
// all in it, whether or not any of them is in scope for this search.
//
// Working from nodes rather than strings makes scope decidable per match, and confines each
// replacement to the node holding it — so replacing one word no longer rewrites an ancestor's
// entire subtree, taking every descendant's identity, listeners and focus with it.

import { SearchReplaceConfig } from '../types'
import { elementIsVisible, isEditable } from '../elements'

/** A place holding at least one occurrence of the search term */
export type MatchInstance =
    /** Character data: ordinary text, and the contents of script and style elements */
    | { kind: 'text'; node: Text; matches: number }
    /** An attribute value, e.g. the href of a link. Only in scope when replacing HTML. */
    | { kind: 'attribute'; element: Element; name: string; matches: number }
    /**
     * A match in an element's own tags, e.g. searching for `<div`. Replacing it rebuilds the
     * element from the rewritten tag and moves the existing children across, so everything
     * beneath keeps its identity.
     */
    | { kind: 'tag'; element: Element; matches: number }
    /**
     * A match spanning a tag boundary, e.g. `<span>x</span>`, which no single tag, attribute or
     * text node holds. Replacing it rewrites the element's innerHTML, the destructive operation
     * this module otherwise avoids, so it is a last resort: only for what nothing else can
     * account for, only on the innermost element that explains it, and never on an element
     * whose subtree holds anything out of scope.
     */
    | { kind: 'markup'; element: Element; matches: number }

/** Character data whose parent is one of these is markup, not prose: only in scope for HTML */
const MARKUP_TEXT = /^(?:SCRIPT|STYLE)$/i

/**
 * Attributes that hold a value the user edits rather than page markup. `value` is excluded
 * because an input's live value is replaced through the element's value property, and counting
 * the attribute as well would count the same occurrence twice.
 */
const NOT_AN_ATTRIBUTE_MATCH = /^value$/i

function countMatches(value: string, config: SearchReplaceConfig): number {
    return (value.match(config.globalSearchPattern) || []).length
}

/**
 * Whether this element's contents are in scope.
 *
 * `elementIsVisible` is only consulted when hidden content is excluded, because it is the
 * expensive part of the walk and the answer does not matter otherwise.
 */
function inScope(element: Element | null, config: SearchReplaceConfig): boolean {
    if (!element) {
        return false
    }
    if (element.tagName.match(MARKUP_TEXT)) {
        // Script and style hold markup, not prose, so they are in scope exactly when replacing
        // HTML. The visibility test below is skipped for them deliberately: they are never
        // rendered, so it would reject them however the Hidden content option is set, and
        // "Replace HTML" that silently skipped every script and stylesheet would be a lie.
        return config.replaceHTML
    }
    if (element.tagName.match(config.elementFilter)) {
        // HTML, HEAD, IFRAME and friends: never searched
        return false
    }
    if (!config.hiddenContent && !elementIsVisible(element as HTMLElement)) {
        return false
    }
    return true
}

/**
 * Every place under `root` holding the search term, in document order.
 *
 * Inputs and textareas are left out: their values are replaced through the value property by
 * the input path, and their `value` attribute is excluded above so the same occurrence is not
 * reported twice.
 */
export function collectInstances(root: Node, config: SearchReplaceConfig): MatchInstance[] {
    const instances: MatchInstance[] = []
    const document = root.ownerDocument ?? (root as Document)
    // Elements whose subtree holds something out of scope. Their innerHTML cannot be trusted to
    // describe only in-scope matches, so they are never considered for a markup instance —
    // otherwise rewriting one would drag the hidden text or the script back into the
    // replacement, which is the behaviour this module exists to stop.
    const tainted = new Set<Element>()
    // How many matches inside each element's innerHTML some other instance already accounts for
    const accounted = new Map<Element, number>()

    function taint(element: Element | null) {
        for (let current = element; current; current = current.parentElement) {
            tainted.add(current)
        }
    }

    function account(element: Element | null, matches: number) {
        for (let current = element; current; current = current.parentElement) {
            accounted.set(current, (accounted.get(current) ?? 0) + matches)
        }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return NodeFilter.FILTER_ACCEPT
            }
            const element = node as Element
            // FILTER_REJECT skips the subtree, not just the element, which is what keeps the
            // text inside a hidden container or a rich text editor out of the results
            if (!inScope(element, config) || isInputLike(element) || isEditable(element)) {
                taint(element)
                return NodeFilter.FILTER_REJECT
            }
            return NodeFilter.FILTER_ACCEPT
        },
    })

    const elements: Element[] = []
    let node: Node | null = walker.currentNode
    for (; node; node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node as Text
            const matches = countMatches(text.data, config)
            if (matches > 0) {
                instances.push({ kind: 'text', node: text, matches })
                account(text.parentElement, matches)
            }
            continue
        }

        // Attributes are part of the HTML and nothing else, so they are only in scope when
        // replacing HTML
        if (!config.replaceHTML || node.nodeType !== Node.ELEMENT_NODE) {
            continue
        }
        const element = node as Element
        elements.push(element)
        if (element === root) {
            // The search is of what is *inside* the root, as innerHTML always was. Its own tags
            // and attributes are the frame around that, not part of it — and counting them
            // means a search for `<b` matches `<body>`, whose replacement would swap out the
            // body element itself.
            continue
        }

        let inAttributes = 0
        for (const attribute of Array.from(element.attributes)) {
            if (attribute.name.match(NOT_AN_ATTRIBUTE_MATCH)) {
                continue
            }
            const matches = countMatches(attribute.value, config)
            if (matches > 0) {
                instances.push({ kind: 'attribute', element, name: attribute.name, matches })
                inAttributes += matches
                // An attribute of E shows up in E's *parent's* innerHTML, not E's own
                account(element.parentElement, matches)
            }
        }

        // The element's own tags, children excluded: `<div class="x"></div>`. Attribute values
        // live inside the opening tag, so what they already account for comes back off.
        const inTags = countMatches(tagsOf(element), config) - inAttributes
        if (inTags > 0) {
            instances.push({ kind: 'tag', element, matches: inTags })
            account(element.parentElement, inTags)
        }
    }

    if (config.replaceHTML) {
        collectMarkupInstances(elements, instances, tainted, accounted, account, config)
    }

    return instances
}

/**
 * Anything in an element's innerHTML that the text and attribute instances cannot explain is a
 * match in the markup itself.
 *
 * Reverse document order visits a descendant before its ancestor, so a surplus is charged to the
 * innermost element that can account for it and the ancestor then sees it as already explained.
 */
function collectMarkupInstances(
    elements: Element[],
    instances: MatchInstance[],
    tainted: Set<Element>,
    accounted: Map<Element, number>,
    account: (element: Element | null, matches: number) => void,
    config: SearchReplaceConfig
): void {
    for (let index = elements.length - 1; index >= 0; index--) {
        const element = elements[index]
        if (tainted.has(element)) {
            continue
        }
        const total = countMatches(element.innerHTML, config)
        const surplus = total - (accounted.get(element) ?? 0)
        if (surplus > 0) {
            instances.push({ kind: 'markup', element, matches: surplus })
            account(element, surplus)
        }
    }
}

/** An element's opening and closing tags with nothing between them */
function tagsOf(element: Element): string {
    return (element.cloneNode(false) as Element).outerHTML
}

function isInputLike(element: Element | null): boolean {
    return !!element && /^(?:INPUT|TEXTAREA)$/i.test(element.tagName)
}

export function countInstances(instances: MatchInstance[]): number {
    return instances.reduce((total, instance) => total + instance.matches, 0)
}

function readInstance(instance: MatchInstance): string {
    switch (instance.kind) {
        case 'text':
            return instance.node.data
        case 'attribute':
            return instance.element.getAttribute(instance.name) ?? ''
        case 'tag':
            return tagsOf(instance.element)
        case 'markup':
            return instance.element.innerHTML
    }
}

function writeInstance(instance: MatchInstance, value: string): void {
    switch (instance.kind) {
        case 'text':
            // Assigning to the text node, not to any ancestor's innerHTML: every other node in
            // the document keeps its identity, and with it the page's listeners and focus
            instance.node.data = value
            break
        case 'attribute':
            instance.element.setAttribute(instance.name, value)
            break
        case 'tag':
            rewriteTags(instance.element, value)
            break
        case 'markup':
            instance.element.innerHTML = value
            break
    }
}

/**
 * Swaps an element for one built from `tags`, carrying the existing children across.
 *
 * Assigning to outerHTML would reparse the children too and hand back new nodes; moving them
 * keeps every descendant's identity, and with it the page's listeners and focus.
 */
function rewriteTags(element: Element, tags: string): void {
    const template = element.ownerDocument.createElement('template')
    template.innerHTML = tags
    const replacement = template.content.firstElementChild
    if (!replacement || template.content.childElementCount !== 1) {
        // The rewritten tag did not parse to a single element — a search that mangled the
        // markup. Leaving the element alone is better than replacing the page with rubble.
        return
    }
    while (element.firstChild) {
        replacement.appendChild(element.firstChild)
    }
    element.replaceWith(replacement)
}

/**
 * Application order.
 *
 * A markup instance recreates everything beneath its element, which detaches the text nodes any
 * other instance in that subtree is holding, so those are written first. Markup instances then
 * go deepest first, each reading an innerHTML that already contains the replacements made
 * below it.
 */
export function orderForReplacement(instances: MatchInstance[]): MatchInstance[] {
    const markup = instances.filter((instance) => instance.kind === 'markup')
    const rest = instances.filter((instance) => instance.kind !== 'markup')
    return [...rest, ...markup.reverse()]
}

/**
 * Replaces in one instance and reports how many occurrences went.
 *
 * `all` replaces every occurrence in this instance; otherwise exactly one, which is what makes
 * a single press of Replace Next take exactly one match off the count.
 */
export function applyInstance(instance: MatchInstance, config: SearchReplaceConfig, all: boolean): number {
    const before = readInstance(instance)
    // Derived here rather than taken from config.searchPattern, whose global flag depends on
    // whether the user pressed Replace All: this has to replace exactly one either way
    const single = new RegExp(config.globalSearchPattern.source, config.globalSearchPattern.flags.replace('g', ''))
    const after = all
        ? before.replace(config.globalSearchPattern, config.replaceTerm)
        : before.replace(single, config.replaceTerm)

    if (after === before) {
        return 0
    }
    writeInstance(instance, after)
    // Recounted rather than trusting the figure from collection time, in case the value has
    // moved on since
    return all ? countMatches(before, config) : 1
}

/** The element a replacement should be announced on, for the page's own listeners */
export function instanceElement(instance: MatchInstance): Element | null {
    return instance.kind === 'text' ? instance.node.parentElement : instance.element
}

/** Exported for tests: what the collector found, by kind */
export function summariseInstances(instances: MatchInstance[]): Record<string, number> {
    return instances.reduce<Record<string, number>>((summary, instance) => {
        summary[instance.kind] = (summary[instance.kind] ?? 0) + instance.matches
        return summary
    }, {})
}
