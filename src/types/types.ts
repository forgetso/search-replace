export enum SearchReplaceCheckboxNames {
    matchCase = 'matchCase',
    inputFieldsOnly = 'inputFieldsOnly',
    visibleOnly = 'visibleOnly',
    wholeWord = 'wholeWord',
    isRegex = 'isRegex',
}

export type SearchReplaceOptions = {
    [key in SearchReplaceCheckboxNames]: boolean
}

export interface SearchReplaceMessage {
    replaceAll: boolean
    action: SearchReplaceAction
    instance: SearchReplaceInstance
    history: SearchReplaceInstance[]
    url?: string
}

export type SearchReplaceInstance = { searchTerm: string; replaceTerm: string; options: SearchReplaceOptions }

export type SearchReplaceStorageItems = { history: SearchReplaceInstance[]; instance: SearchReplaceInstance }

export interface SearchReplaceStorageMessage extends SearchReplaceStorageItems {
    recover: boolean
}

export type SearchReplaceStorage = {
    storage: SearchReplaceStorageItems
}

export type SearchReplaceAction = 'searchReplace' | 'store'

export enum SelectorType {
    id = 'id',
    class = 'class',
    tag = 'tag',
    attribute = 'attribute',
    text = 'text',
    href = 'href',
    src = 'src',
}

export interface Selector {
    type: SelectorType
    value: string
    iframe: boolean
}

export interface RichTextEditor {
    container?: Selector
    editor: Selector
}

export enum RegexFlags {
    CaseInsensitive = 'i',
    Global = 'g',
}
