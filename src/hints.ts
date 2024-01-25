import { HINTS } from './constants'
import { Hint } from './types'

export function getHints(document: Document): Hint[] {
    const hints: Hint[] = []
    for (const [hintType, { domain, selector }] of Object.entries(HINTS)) {
        const hasSelector = document.querySelector(selector)
        if (window.location.href.indexOf(domain) > -1 || hasSelector) {
            hints.push(HINTS[hintType])
        }
    }
    return hints
}
