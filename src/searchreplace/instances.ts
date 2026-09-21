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
     * A match that exists only in the markup — `<p`, or a term spanning a tag boundary — and so
     * cannot be written through a text node or an attribute. Replacing it rewrites the
     * element's innerHTML, which is the destructive operation this module otherwise avoids, so
     * it is confined to the innermost element that can account for the match and is only used
     * where the surplus cannot be explained any other way.
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
        for (const attribute of Array.from(element.attributes)) {
            if (attribute.name.match(NOT_AN_ATTRIBUTE_MATCH)) {
                continue
            }
            const matches = countMatches(attribute.value, config)
            if (matches > 0) {
                instances.push({ kind: 'attribute', element, name: attribute.name, matches })
                // An attribute of E shows up in E's *parent's* innerHTML, not E's own
                account(element.parentElement, matches)
            }
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
        case 'markup':
            instance.element.innerHTML = value
            break
    }
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
