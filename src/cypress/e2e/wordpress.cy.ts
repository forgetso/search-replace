/// <reference types="cypress" />

import { ELEMENT_FILTER } from '../../constants'
import { isBlobIframe } from '../../elements'
import { searchReplace } from '../../searchreplace'

const SEARCHTERM = 'Hello world'
const REPLACETERM = 'Something else'

describe('Search Replace WordPress', { baseUrl: 'http://localhost:8080/', responseTimeout: 120e3 }, () => {
    before(() => {
        cy.cleanInstall().then(() => {
            cy.installWordPress().then(() => {
                cy.get('a[href*="wp-login.php"]')
                    .click()
                    .then(() => {
                        cy.login().then(() => {
                            cy.visit('/wp-admin/post.php?post=1&action=edit').then(() => {
                                cy.get('iframe[name="editor-canvas"]').then((iframe) => {
                                    expect(iframe.contents().find('body')).to.exist
                                    cy.get('button[aria-label="Close"]')
                                        .click()
                                        .then(() => {
                                            cy.get('button[aria-label="Close"]').should('not.exist')
                                        })
                                })
                            })
                        })
                    })
            })
        })
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
                    expect(result.searchReplaceResult.count.original).to.equal(1)
                })
            ).then(() => {
                console.log('done')
            })
        })
    })
    it('replaces the search term and counts the correct number of occurrences', () => {
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
                    expect(result.searchReplaceResult.count.original).to.equal(0)
                })
            ).then(() => {
                console.log('done')
            })
        })
    })
    // iframes don't render in cypress
    it('replaces the search term, updates the post, reloads the page, and the counts the correct number of occurrences', () => {
        cy.window()
            .then((window) => {
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
                    )
                ).then(() => {
                    cy.savePost().then(() => {
                        cy.reload()
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
                                expect(result.searchReplaceResult.count.original).to.equal(0)
                            })
                        )
                    })
                })
            })
            .then(() => {
                console.log('done')
            })
    })
})
