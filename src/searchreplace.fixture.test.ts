import { ELEMENT_FILTER } from './constants'
import { beforeEach, describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { searchReplace } from './searchreplace'

/**
 * The page the Cypress end-to-end suite runs against.
 *
 * Those specs only run in CI, so a change that broke them was invisible until the pull request
 * went red. Counting the same fixture here, with the same expectations, catches it from
 * `npm test`. jsdom is not a browser, so this is a guard rather than a replacement for the
 * real thing.
 */
const FIXTURE = readFileSync('tests/test.html', 'utf8')

function run(options: Record<string, unknown>) {
    return searchReplace({
        action: 'count',
        window,
        searchTerm: '<div',
        replaceTerm: 'x',
        inputFieldsOnly: false,
        isRegex: false,
        hiddenContent: true,
        wholeWord: false,
        matchCase: false,
        replaceHTML: true,
        replaceAll: true,
        isIframe: false,
        iframes: [],
        elementFilter: ELEMENT_FILTER,
        ...options,
    } as never)
}

beforeEach(() => {
    document.documentElement.innerHTML = FIXTURE
})

describe('counting <div in the Cypress fixture', () => {
    test('counts <div with hidden content included (cypress expects 18)', async () => {
        const { count } = (await run({ hiddenContent: true })).searchReplaceResult
        console.log('hiddenContent true  ->', count.original)
        expect(count.original).toBe(18)
    })

    test('counts <div with hidden content excluded (cypress expects 11)', async () => {
        const { count } = (await run({ hiddenContent: false })).searchReplaceResult
        console.log('hiddenContent false ->', count.original)
        expect(count.original).toBe(11)
    })
})
