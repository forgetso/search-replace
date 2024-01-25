/// <reference types="cypress" />
import { ELEMENT_FILTER } from '../../constants'
import { copyElementAndRemoveSelectedElements, elementIsVisible } from '../../elements'
import { searchReplace } from '../../searchreplace'

const SEARCHTERM = 'This is a test!!!'
const REPLACETERM = 'Something else!!!'

describe('Search Replace ', () => {
    beforeEach(() => {
        cy.visit('http://localhost:9000/tests/test.html')
    })

    it('creates a copy of the DOM with hidden elements removed', () => {
        cy.document().then((document) => {
            const copy = copyElementAndRemoveSelectedElements(document.body, (element: HTMLElement) => {
                return !elementIsVisible(element, true, true)
            })
            const hidden = copy.clonedElementRemoved.querySelectorAll('.hidden')
            expect(hidden.length).to.equal(0)
            expect(copy.clonedElementRemoved.children.length).to.be.eq(2)
        })
    })

    it('correctly identifies the number of visible inputs', () => {
        cy.document().then((document) => {
            const inputs = Array.from(<NodeListOf<HTMLElement>>document.querySelectorAll('input,textarea'))
            const visible = inputs.filter((el) => {
                return elementIsVisible(el)
            })
            expect(visible.length).to.equal(4)
        })
    })

    it.only('counts the correct number of occurrences', () => {
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
                    true,
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
            ).then(() => {
                console.log('done')
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
                    false,
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
            ).then(() => {
                console.log('done')
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
                    true,
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
            ).then(() => {
                console.log('done')
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
            ).then(() => {
                console.log('done')
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
            ).then(() => {
                console.log('done')
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
                    true,
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
            ).then(() => {
                console.log('done')
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
                    true,
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
            ).then(() => {
                console.log('done')
            })
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
                    true,
                    false,
                    false,
                    true,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then((result) => {
                    expect(result.searchReplaceResult.count.original).to.equal(18)
                })
            ).then(() => {
                console.log('done')
            })
        })
    })

    it('counts the correct number of divs when replaceHTML and hiddenContent is not set', () => {
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
                    expect(result.searchReplaceResult.count.original).to.equal(11)
                })
            ).then(() => {
                console.log('done')
            })
        })
    })

    it('replaces inline style to make invisible divs visible and then correctly counts visible occurrences of search term', () => {
        cy.window().then((window) => {
            const iframes = Array.from(<NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe'))

            cy.wrap(
                searchReplace(
                    'searchReplace',
                    window,
                    'display: none;',
                    'display: block;',
                    false,
                    true,
                    true,
                    false,
                    false,
                    true,
                    true,
                    false,
                    iframes,
                    ELEMENT_FILTER
                ).then(() => {
                    searchReplace(
                        'count',
                        window,
                        SEARCHTERM,
                        '',
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
                    ).then((countResult) => {
                        expect(countResult.searchReplaceResult.count.original).to.equal(7)
                    })
                })
            ).then(() => {
                console.log('done')
            })
        })
    })
})
