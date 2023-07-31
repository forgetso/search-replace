import { RegexFlags } from './types'

function regExEscape(text: string): string {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

export function getSearchPattern(searchTerm: string, isRegex: boolean, flags: string, wholeWord: boolean): RegExp {
    const escaped = regExEscape(searchTerm)
    try {
        const searchTermEscaped = isRegex ? searchTerm : escaped
        if (wholeWord && !isRegex) {
            return new RegExp(`\\b${searchTermEscaped}\\b`, flags)
        } else {
            return new RegExp(searchTermEscaped, flags)
        }
    } catch (e) {
        console.warn(`error building regex: ${searchTerm}`)
        return new RegExp(escaped, flags)
    }
}

export function getFlags(matchCase: boolean, replaceAll: boolean): string {
    return (replaceAll ? RegexFlags.Global : '') + (matchCase ? '' : RegexFlags.CaseInsensitive)
}
