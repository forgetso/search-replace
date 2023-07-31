/// <reference types="cypress" />
import { elementIsVisible, getSearchOccurrences } from '../../src/util'
import { RegexFlags } from '../../src/types'
import { searchReplace } from '../../src/searchreplace'

const SEARCHTERM = 'This is a test!!!'
const FLAGSGLOBAL = `${RegexFlags.Global}${RegexFlags.CaseInsensitive}`
const SEARCHPATTERNGLOBAL = new RegExp(SEARCHTERM, FLAGSGLOBAL)
const REPLACETERM = 'This is not a test!!!'
const REPLACETERMGLOBAL = new RegExp(REPLACETERM, FLAGSGLOBAL)

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
        cy.document().then((document) => {
            const occurences = getSearchOccurrences(document, SEARCHPATTERNGLOBAL, false)
            expect(occurences).to.equal(5)
        })
    })

    it('counts the correct number of visible occurrences', () => {
        cy.document().then((document) => {
            const occurences = getSearchOccurrences(document, SEARCHPATTERNGLOBAL, true)
            expect(occurences).to.equal(4)
        })
    })

    it('counts zero occurrences for missing text', () => {
        cy.document().then((document) => {
            const occurences = getSearchOccurrences(document, /This text is not on the page/gi, false)
            expect(occurences).to.equal(0)
        })
    })

    it('replaces the search term with the replace term', () => {
        cy.window().then((window) => {
            searchReplace(window, SEARCHTERM, REPLACETERM, FLAGSGLOBAL, false, false, false, false).then(() => {
                console.log('REPLACETERMGLOBAL', REPLACETERMGLOBAL)
                const occurences = getSearchOccurrences(window.document, REPLACETERMGLOBAL, false)
                expect(occurences).to.equal(5)
            })
        })
    })

    it('replaces the first occurrence of the search term in a content editor with the replace term', () => {
        cy.window().then((window) => {
            searchReplace(window, SEARCHTERM, REPLACETERM, RegexFlags.CaseInsensitive, false, false, false, false).then(
                () => {
                    console.log('REPLACETERMGLOBAL', REPLACETERMGLOBAL)
                    const occurences = getSearchOccurrences(window.document, REPLACETERMGLOBAL, false)
                    expect(occurences).to.equal(1)
                }
            )
        })
    })
})
