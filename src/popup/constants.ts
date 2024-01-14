import { SearchReplaceCheckboxNames } from '../types'

const { matchCase, inputFieldsOnly, visibleOnly, wholeWord, isRegex, replaceHTML, save, replaceAll } =
    SearchReplaceCheckboxNames

export const INPUT_ELEMENTS_AND_EVENTS = {
    searchTerm: ['change', 'keyup', 'blur'],
    replaceTerm: ['change', 'keyup', 'blur'],
    [matchCase]: ['change', 'click'],
    [inputFieldsOnly]: ['change', 'click'],
    [visibleOnly]: ['change', 'click'],
    [wholeWord]: ['change', 'click'],
    [isRegex]: ['change'],
    [replaceHTML]: ['change'],
    help: ['click'],
}

export const CHECKBOXES: SearchReplaceCheckboxNames[] = Object.values(SearchReplaceCheckboxNames)
export const MIN_SEARCH_TERM_LENGTH = 1
export const SEARCH_TERM_INPUT_ID = 'searchTerm'
export const REPLACE_TERM_INPUT_ID = 'replaceTerm'
