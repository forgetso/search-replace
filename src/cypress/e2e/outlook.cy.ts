/// <reference types="cypress" />

import { ELEMENT_FILTER } from '../../constants'
import { isBlobIframe } from '../../elements'
import { searchReplace } from '../../searchreplace'

const SEARCHTERM = 'Something else'
const REPLACETERM = 'The replacement'
const BASEURL = 'http://localhost:9000'
describe('Search Replace WordPress', { baseUrl: BASEURL, responseTimeout: 120e3 }, () => {
    beforeEach(() => {
        cy.visit('http://localhost:9000/tests/outlook/test.html')
    })

    it('counts the correct number of occurrences', () => {
        cy.window().then((window) => {
            console.log(window.location.host)
            const iframes = Array.from(
                <NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe')
            ).filter((iframe) => !isBlobIframe(iframe))
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
                    console.log(`result`, result)
                    expect(result.searchReplaceResult.count.original).to.equal(1)
                })
            ).then(() => {
                console.log('done')
            })
        })
    })
    it('replaces the search term and then replaces it again', () => {
        cy.window().then((window) => {
            console.log(window.location.host)
            const iframes = Array.from(
                <NodeListOf<HTMLIFrameElement>>window.document.querySelectorAll('iframe')
            ).filter((iframe) => !isBlobIframe(iframe))
            cy.wrap(
                searchReplace(
                    'searchReplace',
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
                ).then((result1) => {
                    expect(result1.searchReplaceResult.count.replaced).to.equal(1)
                    searchReplace(
                        'searchReplace',
                        window,
                        REPLACETERM,
                        SEARCHTERM,
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
                    ).then((result2) => {
                        expect(result2.searchReplaceResult.count.replaced).to.equal(1)
                    })
                })
            ).then(() => {
                console.log('done')
            })
        })
    })
})
