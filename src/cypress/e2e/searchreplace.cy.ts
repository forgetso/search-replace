/// <reference types="cypress" />
import { ELEMENT_FILTER } from '../../constants'
import { elementIsVisible } from '../../elements'
import { searchReplace } from '../../searchreplace'

const SEARCHTERM = 'This is a test!!!'
const REPLACETERM = 'This is not a test!!!'

describe('Search Replace ', () => {
    beforeEach(() => {
        cy.visit('http://localhost:9000/tests/test.html')
    })

    it('correctly identifies the number of visible inputs', () => {
        cy.document().then((document) => {
            const inputs = Array.from(<NodeListOf<HTMLElement>>document.querySelectorAll('input,textarea'))
            const visible = inputs.filter(elementIsVisible)
            expect(visible.length).to.equal(4)
        })
    })

    it('counts the correct number of occurrences', () => {
        cy.window().then((window) => {
            console.log(window.location.host)
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))
            console.log('iframes', iframes)
            cy.wrap(
                searchReplace(
                    'count',
                    window,
                    SEARCHTERM,
                    REPLACETERM,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    console.log(`result`, result)
                    expect(result.searchReplaceResult.count.original).to.equal(8)
                })
            ).then(() => {})
        })
    })

    // TODO add visibilty test for divs contained within hidden parent divs that are multiple levels deep
    // it('counts the correct number of visible occurrences for nested hidden items', () => {

    it('counts the correct number of visible occurrences', () => {
        cy.window().then((window) => {
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))

            cy.wrap(
                searchReplace(
                    'count',
                    window,
                    SEARCHTERM,
                    REPLACETERM,
                    false,
                    false,
                    true,
                    false,
                    false,
                    false,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.searchReplaceResult.count.original).to.equal(5)
                })
            ).then(() => {})
        })
    })

    it('counts zero occurrences for missing text', () => {
        cy.window().then((window) => {
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))

            cy.wrap(
                searchReplace(
                    'count',
                    window,
                    'This text is not on the page',
                    REPLACETERM,
                    true,
                    false,
                    false,
                    false,
                    false,
                    false,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.searchReplaceResult.count.original).to.equal(0)
                })
            ).then(() => {})
        })
    })

    it('counts the correct number of occurrences for inputs only', () => {
        cy.window().then((window) => {
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))

            cy.wrap(
                searchReplace(
                    'count',
                    window,
                    SEARCHTERM,
                    REPLACETERM,
                    true,
                    false,
                    false,
                    false,
                    false,
                    false,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.searchReplaceResult.count.original).to.equal(4)
                })
            ).then(() => {})
        })
    })

    it('counts the correct number of occurrences for visible inputs only', () => {
        cy.window().then((window) => {
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))

            cy.wrap(
                searchReplace(
                    'count',
                    window,
                    SEARCHTERM,
                    REPLACETERM,
                    true,
                    false,
                    true,
                    false,
                    false,
                    false,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.searchReplaceResult.count.original).to.equal(3)
                })
            ).then(() => {})
        })
    })

    it('replaces the search term with the replace term', () => {
        cy.window().then((window) => {
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))

            cy.wrap(
                searchReplace(
                    'searchReplace',
                    window,
                    SEARCHTERM,
                    REPLACETERM,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(
                        result.searchReplaceResult.count.original - result.searchReplaceResult.count.replaced
                    ).to.equal(0)
                })
            ).then(() => {})
        })
    })

    it('replaces the first occurrence of the search term in a content editor with the replace term', () => {
        cy.window().then((window) => {
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))

            cy.wrap(
                searchReplace(
                    'searchReplace',
                    window,
                    SEARCHTERM,
                    REPLACETERM,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(
                        result.searchReplaceResult.count.original - result.searchReplaceResult.count.replaced
                    ).to.equal(7)
                })
            ).then(() => {})
        })
    })

    it('counts the correct number of divs when replaceHTML is set', () => {
        cy.window().then((window) => {
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))

            cy.wrap(
                searchReplace(
                    'count',
                    window,
                    '<div',
                    REPLACETERM,
                    false,
                    false,
                    false,
                    false,
                    false,
                    true,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.searchReplaceResult.count.original).to.equal(14)
                })
            ).then(() => {})
        })
    })

    it('counts the correct number of divs when replaceHTML and visibleOnly is set', () => {
        cy.window().then((window) => {
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))

            cy.wrap(
                searchReplace(
                    'count',
                    window,
                    '<div',
                    REPLACETERM,
                    false,
                    false,
                    true,
                    false,
                    false,
                    true,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.searchReplaceResult.count.original).to.equal(11)
                })
            ).then(() => {})
        })
    })
})
