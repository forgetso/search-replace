export enum SearchReplaceCheckboxNames {
    matchCase = 'matchCase',
    inputFieldsOnly = 'inputFieldsOnly',
    visibleOnly = 'visibleOnly',
    wholeWord = 'wholeWord',
    isRegex = 'isRegex',
    replaceAll = 'replaceAll',
    save = 'save',
}

export enum SearchReplaceCheckboxLabels {
    matchCase = 'Match case',
    inputFieldsOnly = 'Input fields only',
    visibleOnly = 'Visible content only',
    wholeWord = 'Match whole word',
    isRegex = 'Regular expression',
    replaceAll = 'Replace all',
    save = 'Save and apply on page reload',
}

export type SearchReplaceOptions = {
    [key in SearchReplaceCheckboxNames]: boolean
}

export interface SearchReplaceMessage {
    action: SearchReplaceAction
    instance: SearchReplaceInstance
    history: SearchReplaceInstance[]
    url?: string
}

export type SearchReplaceInstance = { searchTerm: string; replaceTerm: string; options: SearchReplaceOptions }

export interface SavedSearchReplaceInstance extends SearchReplaceInstance {
    url: string
}

export type SavedInstanceId = number

export type SavedInstances = { [key: SavedInstanceId]: SavedSearchReplaceInstance }

export type SearchReplaceStorageItems = {
    history: SearchReplaceInstance[]
    instance: SearchReplaceInstance
    saved?: SavedInstances
}

export interface SearchReplaceStorageMessage {
    actions: { [key in SearchReplaceAction]?: boolean }
    url?: string
    save?: boolean
    storage?: SearchReplaceStorageItems
}

export type SearchReplacePopupStorage = {
    storage: SearchReplaceStorageItems
}

export type SearchReplaceAction = 'searchReplace' | 'store' | 'recover' | 'delete' | 'clearHistory' | 'save'

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
    value: string[]
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

export interface LangList {
    languageCode: string
    languageName: string
}

export interface LangFile {
    data: {
        [key: string]: {
            message: string
            description: string
        }
    }
    dataFallback: {
        [key: string]: {
            message: string
            description: string
        }
    }
}

export type TranslationProxy = (key: string) => string
