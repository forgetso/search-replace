/// <reference types="cypress" />
import { ELEMENT_FILTER } from '../../constants'
import { SearchReplaceActions } from '../../types'
import { searchReplace } from '../../searchreplace'

/**
 * The counts the popup displays, checked in a real browser.
 *
 * The equivalent jsdom suite (searchreplace.invariants.test.ts) covers far more combinations,
 * but jsdom applies no stylesheets and has no layout, so it cannot tell whether an element
 * hidden by a CSS class is really invisible. This fixture hides things the way real sites do,
 * which is the situation that produced "-2 matches" on a live news site.
 */

const SEARCH = 'European'
const REPLACE = 'American'

type Overrides = { hiddenContent?: boolean; replaceHTML?: boolean; replaceAll?: boolean }

function run(action: SearchReplaceActions, window: Window, overrides: Overrides = {}) {
    return searchReplace({
        action,
        window,
        searchTerm: SEARCH,
        replaceTerm: REPLACE,
        inputFieldsOnly: false,
        isRegex: false,
        hiddenContent: false,
        wholeWord: false,
        matchCase: false,
        replaceHTML: false,
        replaceAll: true,
        isIframe: false,
        iframes: [],
        elementFilter: ELEMENT_FILTER,
        ...overrides,
    })
}

const MODES: { name: string; options: Overrides }[] = [
    { name: 'text', options: {} },
    { name: 'text with hidden content', options: { hiddenContent: true } },
    { name: 'HTML', options: { replaceHTML: true } },
    { name: 'HTML with hidden content', options: { replaceHTML: true, hiddenContent: true } },
    { name: 'HTML replacing only the next match', options: { replaceHTML: true, replaceAll: false } },
]

describe('Reported match counts', () => {
    beforeEach(() => {
        cy.visit('http://localhost:9000/tests/negative_counts.html')
    })

    for (const { name, options } of MODES) {
        it(`never reports more replacements than matches: ${name}`, () => {
            cy.window().then((window) => {
                cy.wrap(
                    run('searchReplace', window, options).then((result) => {
                        const { count } = result.searchReplaceResult
                        expect(count.original, 'matches found').to.be.at.least(0)
                        expect(count.replaced, 'replacements made').to.be.at.least(0)
                        // The popup shows `original - replaced` as the matches remaining, so a
                        // replaced count above original is displayed as a negative number
                        expect(count.replaced, 'replacements made').to.be.at.most(count.original)
                    })
                )
            })
        })
    }

    it('counts the text inside a header element', () => {
        // The element filter used to be unanchored, so HEADER matched HEAD and everything in
        // the page header was dropped from the count while still being replaced
        cy.window().then((window) => {
            cy.wrap(
                run('count', window).then((result) => {
                    // h1, the main paragraph, the span, and the paragraph beside the script
                    expect(result.searchReplaceResult.count.original).to.equal(4)
                })
            )
        })
    })

    // Replacing in HTML rewrites the whole subtree of the outermost matching element, so it
    // reaches script contents and hidden text regardless of the "Hidden content" setting. These
    // two tests pin that known limitation; see the note in searchreplace.invariants.test.ts.
    it('leaves a top level script alone', () => {
        // A script that is a direct child of body is safe: body is the root of the walk and is
        // never itself the element whose innerHTML gets rewritten
        cy.window().then((window) => {
            cy.wrap(
                run('searchReplace', window, { replaceHTML: true }).then(() => {
                    const script = window.document.getElementById('page-script')
                    expect(script?.textContent).to.contain(SEARCH)
                    expect(script?.textContent).to.not.contain(REPLACE)
                })
            )
        })
    })

    it('KNOWN LIMITATION: Replace HTML rewrites a script sharing a container with matching text', () => {
        cy.window().then((window) => {
            cy.wrap(
                run('searchReplace', window, { replaceHTML: true }).then(() => {
                    const script = window.document.getElementById('nested-script')
                    expect(script?.textContent).to.contain(REPLACE)
                })
            )
        })
    })

    it('KNOWN LIMITATION: Replace HTML rewrites text hidden by a stylesheet', () => {
        cy.window().then((window) => {
            cy.wrap(
                run('searchReplace', window, { replaceHTML: true }).then(() => {
                    const hidden = window.document.querySelectorAll('.promo')
                    hidden.forEach((el) => expect(el.textContent).to.equal(REPLACE))
                })
            )
        })
    })

    it('replaces the visible text on the page', () => {
        // The regression this guards against: a previous attempt to protect hidden and script
        // content stopped the replacement reaching any text inside a container that held one
        cy.window().then((window) => {
            cy.wrap(
                run('searchReplace', window, { replaceHTML: true }).then((result) => {
                    expect(result.searchReplaceResult.count.replaced).to.be.greaterThan(0)
                    expect(window.document.querySelector('h1')?.textContent).to.equal(REPLACE)
                    expect(window.document.querySelector('main p')?.textContent).to.contain(REPLACE)
                    expect(window.document.querySelector('span')?.textContent).to.equal(REPLACE)
                })
            )
        })
    })
})
