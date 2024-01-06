/// <reference types="cypress" />
import { ELEMENT_FILTER } from '../../constants'
import { elementIsVisible } from '../../util'
import { searchReplace } from '../../searchreplace'

const SEARCHTERM = 'This is a test!!!'
const REPLACETERM = 'This is not a test!!!'

describe('Search Replace ', () => {
    beforeEach(() => {
        cy.visit('http://localhost:9000/tests/test.html')
    })

    it('correctly identifies the number of visible inputs', () => {
        cy.document().then((document) => {
            const inputs = Array.from(
                <NodeListOf<HTMLInputElement | HTMLTextAreaElement>>document.querySelectorAll('input,textarea')
            )
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
                    true,
                    false,
                    iframes,
                    false,
                    ELEMENT_FILTER
                ).then((result) => {
                    console.log(`result`, result)
                    expect(result.count.original).to.equal(6)
                })
            ).then(() => {
                console.log(`after wrap`)
            })
        })
    })

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
                    true,
                    false,
                    iframes,
                    false,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.count.original).to.equal(5)
                })
            ).then(() => {
                console.log(`after wrap`)
            })
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
                    true,
                    false,
                    iframes,
                    false,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.count.original).to.equal(0)
                })
            ).then(() => {
                console.log(`after wrap`)
            })
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
                    true,
                    false,
                    iframes,
                    false,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.count.original).to.equal(4)
                })
            ).then(() => {
                console.log(`after wrap`)
            })
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
                    true,
                    false,
                    iframes,
                    false,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.count.original).to.equal(3)
                })
            ).then(() => {
                console.log(`after wrap`)
            })
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
                    true,
                    false,
                    iframes,
                    false,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.count.original - result.count.replaced).to.equal(0)
                })
            ).then(() => {
                console.log(`after wrap`)
            })
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
                    iframes,
                    false,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.count.original - result.count.replaced).to.equal(5)
                })
            ).then(() => {
                console.log(`after wrap`)
            })
        })
    })
})
