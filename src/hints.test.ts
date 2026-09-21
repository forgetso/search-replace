import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { getHints } from './hints'

const realHref = window.location.href

/** hints.ts matches on `window.location.href`, which jsdom will not let us navigate */
function stubLocation(href: string) {
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, href, toString: () => href },
    })
}

beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
})

afterEach(() => {
    stubLocation(realHref)
})

describe('getHints', () => {
    test('returns no hints on an unremarkable page', () => {
        expect(getHints(document)).toEqual([])
    })

    test('detects gmail from its meta tag', () => {
        document.head.innerHTML = '<meta content="Gmail">'
        expect(getHints(document).map((h) => h.name)).toEqual(['gmail'])
    })

    test('detects gmail from the url even without the meta tag', () => {
        stubLocation('https://mail.google.com/mail/u/0/#inbox')
        expect(getHints(document).map((h) => h.name)).toEqual(['gmail'])
    })

    test('detects amazon seller central from its marker attribute', () => {
        document.body.innerHTML = '<div product="SellOnAmazon"></div>'
        expect(getHints(document).map((h) => h.name)).toEqual(['amazon_seller'])
    })

    test('detects amazon seller central from the url', () => {
        stubLocation('https://sellercentral.amazon.co.uk/listing/edit')
        expect(getHints(document).map((h) => h.name)).toEqual(['amazon_seller'])
    })

    test('returns advice text alongside the hint name', () => {
        document.head.innerHTML = '<meta content="Gmail">'
        const [hint] = getHints(document)
        expect(hint.hint).toContain('Input fields only')
    })

    test('can return more than one hint at once', () => {
        document.head.innerHTML = '<meta content="Gmail">'
        document.body.innerHTML = '<div product="SellOnAmazon"></div>'
        expect(
            getHints(document)
                .map((h) => h.name)
                .sort()
        ).toEqual(['amazon_seller', 'gmail'])
    })
})
