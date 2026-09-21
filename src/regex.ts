import { RegexFlags } from './types'

function regExEscape(text: string): string {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

/**
 * HTML entities for characters a user cannot type on a keyboard but frequently needs to find,
 * paired with the character each one denotes.
 *
 * A page that was authored with `&nbsp;` holds U+00A0 in the DOM, so a text search for the
 * literal string "&nbsp;" matches nothing — while an HTML search matches, because innerHTML
 * serialises U+00A0 back to `&nbsp;`. Searching for either form therefore matches both.
 *
 * Deliberately limited to invisible characters. Entities such as `&amp;` are excluded: making a
 * search for "&amp;" also match a bare "&" would surprise rather than help.
 */
const INVISIBLE_CHARACTER_ENTITIES = [
    { entity: '&nbsp;', character: ' ' },
    { entity: '&ensp;', character: ' ' },
    { entity: '&emsp;', character: ' ' },
    { entity: '&thinsp;', character: ' ' },
    { entity: '&zwnj;', character: '‌' },
    { entity: '&zwj;', character: '‍' },
    { entity: '&shy;', character: '­' },
]

/** Matches either form of any of the above, as a capturing group so that split() keeps it */
const ENTITY_OR_CHARACTER = new RegExp(
    `(${INVISIBLE_CHARACTER_ENTITIES.flatMap(({ entity, character }) => [
        regExEscape(entity),
        regExEscape(character),
    ]).join('|')})`,
    'gi'
)

function findEntity(text: string) {
    return INVISIBLE_CHARACTER_ENTITIES.find(
        ({ entity, character }) => text.toLowerCase() === entity || text === character
    )
}

/**
 * Escape a literal search term, expanding any invisible-character entity into an alternation
 * that matches both the entity text and the character itself.
 */
function escapeLiteralTerm(searchTerm: string): string {
    return searchTerm
        .split(ENTITY_OR_CHARACTER)
        .map((part) => {
            const found = findEntity(part)
            return found ? `(?:${regExEscape(found.entity)}|${regExEscape(found.character)})` : regExEscape(part)
        })
        .join('')
}

export function getSearchPattern(searchTerm: string, isRegex: boolean, flags: string, wholeWord: boolean): RegExp {
    const escaped = escapeLiteralTerm(searchTerm)
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
