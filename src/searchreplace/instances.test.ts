import { ELEMENT_FILTER } from '../constants'
import { SearchReplaceConfig } from '../types'
import { applyInstance, collectInstances, countInstances, orderForReplacement, summariseInstances } from './instances'
import { beforeEach, describe, expect, test } from 'vitest'

const TERM = 'European'

function configFor(options: Partial<SearchReplaceConfig> = {}): SearchReplaceConfig {
    return {
        action: 'count',
        replace: false,
        replaceNext: false,
        replaceAll: true,
        searchTerm: TERM,
        replaceTerm: 'American',
        flags: 'g',
        inputFieldsOnly: false,
        isRegex: false,
        replaceHTML: false,
        hiddenContent: false,
        wholeWord: false,
        searchPattern: new RegExp(TERM, 'g'),
        globalSearchPattern: new RegExp(TERM, 'g'),
        matchCase: false,
        isIframe: false,
        iframes: [],
        elementFilter: ELEMENT_FILTER,
        usesKnockout: false,
        searchTarget: 'innerText',
        shadowRoots: [],
        ...options,
    } as SearchReplaceConfig
}

const html = (config: Partial<SearchReplaceConfig> = {}) =>
    configFor({ replaceHTML: true, searchTarget: 'innerHTML', ...config })

function collect(markup: string, config: SearchReplaceConfig) {
    document.body.innerHTML = markup
    return collectInstances(document.body, config)
}

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('what is in scope', () => {
    test('ordinary text always is', () => {
        expect(summariseInstances(collect('<p>European</p>', configFor()))).toEqual({ text: 1 })
    })

    test('script and style contents only when replacing HTML', () => {
        const markup = '<script>var a = "European"</script><style>.European { color: red; }</style>'

        expect(countInstances(collect(markup, configFor()))).toBe(0)
        expect(countInstances(collect(markup, html()))).toBe(2)
    })

    test('script and style are in scope despite never being visible', () => {
        // They are display:none by definition, so a visibility test would reject them however
        // the Hidden content option is set
        const instances = collect('<script>var a = "European"</script>', html({ hiddenContent: false }))

        expect(countInstances(instances)).toBe(1)
    })

    test('attributes only when replacing HTML', () => {
        const markup = '<a href="/European-news" title="European">link</a>'

        expect(countInstances(collect(markup, configFor()))).toBe(0)
        expect(summariseInstances(collect(markup, html()))).toEqual({ attribute: 2 })
    })

    test('an input value is left to the input path, attribute and all', () => {
        // Counting the value attribute here as well would report the same occurrence twice
        const instances = collect('<input type="text" value="European">', html())

        expect(countInstances(instances)).toBe(0)
    })

    test('hidden text only when Hidden content is set', () => {
        const markup = '<p>European</p><p style="display: none;">European</p>'

        expect(countInstances(collect(markup, configFor()))).toBe(1)
        expect(countInstances(collect(markup, configFor({ hiddenContent: true })))).toBe(2)
    })

    test('a rich text editor is left to the input path', () => {
        const instances = collect('<div contenteditable="true">European</div>', configFor())

        expect(countInstances(instances)).toBe(0)
    })
})

describe('markup matches', () => {
    test('a match in a tag is charged to the element whose tag it is', () => {
        const config = html({ searchTerm: '<b', searchPattern: /<b/g, globalSearchPattern: /<b/g })
        const instances = collect('<div><p>a <b>bold</b> word</p></div>', config)

        expect(summariseInstances(instances)).toEqual({ tag: 1 })
        const tag = instances.find((instance) => instance.kind === 'tag')
        expect(tag?.kind === 'tag' && tag.element.tagName).toBe('B')
    })

    test('one instance per element, however deeply they nest', () => {
        // An ancestor's innerHTML repeats every descendant's tag, so charging matches to
        // innerHTML counted the same <div once per level of nesting
        const config = html({ searchTerm: '<div', searchPattern: /<div/g, globalSearchPattern: /<div/g })
        const instances = collect('<div><div><div>x</div></div></div>', config)

        expect(countInstances(instances)).toBe(3)
    })

    test('a term spanning a tag boundary falls back to the innermost element holding it', () => {
        const term = '<span>x</span>'
        const pattern = /<span>x<\/span>/g
        const config = html({ searchTerm: term, searchPattern: pattern, globalSearchPattern: pattern })
        const instances = collect('<div id="outer"><p><span>x</span></p></div>', config)

        expect(summariseInstances(instances)).toEqual({ markup: 1 })
        const markup = instances.find((instance) => instance.kind === 'markup')
        expect(markup?.kind === 'markup' && markup.element.tagName).toBe('P')
    })

    test('rewriting a tag keeps the children it had', () => {
        const config = html({ searchTerm: '<b', searchPattern: /<b/g, globalSearchPattern: /<b/g })
        document.body.innerHTML = '<p><b>bold <i id="kept">and italic</i></b></p>'
        const kept = document.getElementById('kept')
        const instances = collectInstances(document.body, config)

        applyInstance(instances[0], { ...config, replaceTerm: '<strong' }, true)

        expect(document.getElementById('kept')).toBe(kept)
        expect(document.querySelector('strong')?.textContent).toBe('bold and italic')
    })

    test('text that a text node already explains is not counted twice', () => {
        const instances = collect('<div><p>European</p></div>', html())

        // Not once for the text node and again as a surplus on <p>, <div> and <body>
        expect(countInstances(instances)).toBe(1)
        expect(summariseInstances(instances)).toEqual({ text: 1 })
    })

    test('an element holding something out of scope never gets a markup instance', () => {
        // Its innerHTML describes the hidden text too, so a surplus taken from it would drag
        // that text back into the replacement
        const config = html({ searchTerm: '<p', searchPattern: /<p/g, globalSearchPattern: /<p/g })
        const instances = collect('<div><p style="display: none;">hidden</p></div>', config)

        expect(countInstances(instances)).toBe(0)
    })
})

describe('applying', () => {
    test('replaces a single occurrence when not replacing all', () => {
        const instances = collect('<p>European European European</p>', configFor())

        expect(applyInstance(instances[0], configFor(), false)).toBe(1)
        expect(document.body.textContent).toBe('American European European')
    })

    test('replaces every occurrence when replacing all', () => {
        const instances = collect('<p>European European European</p>', configFor())

        expect(applyInstance(instances[0], configFor(), true)).toBe(3)
        expect(document.body.textContent).toBe('American American American')
    })

    test('writes through the text node, leaving the rest of the document untouched', () => {
        document.body.innerHTML = '<div><p id="target">European</p><p id="other">text</p></div>'
        const other = document.getElementById('other')
        const otherText = other?.firstChild
        const instances = collectInstances(document.body, configFor())

        applyInstance(instances[0], configFor(), true)

        expect(document.getElementById('other')).toBe(other)
        expect(other?.firstChild).toBe(otherText)
    })

    test('reports nothing replaced when the value has moved on since collection', () => {
        const instances = collect('<p>European</p>', configFor())
        const instance = instances[0]
        if (instance.kind === 'text') {
            instance.node.data = 'already changed'
        }

        expect(applyInstance(instance, configFor(), true)).toBe(0)
    })
})

describe('ordering', () => {
    test('markup instances go last, deepest first', () => {
        // A markup instance recreates its subtree, detaching the text nodes the other instances
        // hold, so everything else has to be written before it
        const config = html()
        document.body.innerHTML = '<div><p>European</p></div>'
        const text = collectInstances(document.body, config)[0]
        const outer = { kind: 'markup', element: document.querySelector('div')!, matches: 1 } as const
        const inner = { kind: 'markup', element: document.querySelector('p')!, matches: 1 } as const

        const ordered = orderForReplacement([outer, text, inner])

        expect(ordered.map((instance) => instance.kind)).toEqual(['text', 'markup', 'markup'])
        expect(ordered[1]).toBe(inner)
        expect(ordered[2]).toBe(outer)
    })
})
