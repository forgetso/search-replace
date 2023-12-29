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

export type SearchReplaceInstance = {
    searchTerm: string
    replaceTerm: string
    options: SearchReplaceOptions
    url?: string
    instanceId?: number
}

export interface SavedSearchReplaceInstance extends Omit<SearchReplaceInstance, 'url'> {
    url: string
}

export type SavedInstanceId = number

export type SavedInstances = { [key: SavedInstanceId]: SavedSearchReplaceInstance }

export type SearchReplaceStorageItems = {
    history: SearchReplaceInstance[]
    instance: SearchReplaceInstance
    saved?: SavedInstances
}

export type SearchReplacePopupStorage = {
    storage: SearchReplaceStorageItems
}

export type SearchReplaceActions =
    | 'searchReplace'
    | 'searchReplaceResponse'
    | 'count'
    | 'searchReplaceResponseMerged'
    | 'searchReplaceResponseBackground'
    | 'clearSavedResponses'

export type SearchReplaceBackgroundActions =
    | SearchReplaceActions
    | 'store'
    | 'recover'
    | 'delete'
    | 'clearHistory'
    | 'save'
    | 'getTranslation'
    | 'getAvailableLanguages'

export interface SearchReplaceBaseMessage {
    action: SearchReplaceBackgroundActions
}

export interface SearchReplaceBackgroundMessage extends SearchReplaceBaseMessage {
    instance?: SearchReplaceInstance
    history?: SearchReplaceInstance[]
    url?: string
    save?: boolean
    storage?: SearchReplaceStorageItems
    tabID?: number
    instanceId?: number
}

export interface SearchReplaceContentMessage {
    action: SearchReplaceActions
    instance: SearchReplaceInstance
    instanceId?: number
    history?: SearchReplaceInstance[]
    url?: string
}

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

export interface SearchReplaceResponse {
    instance: SearchReplaceInstance
    inIframe: boolean
    hints?: string[]
    location: string
    result: SearchReplaceResult
    action: SearchReplaceActions
    iframes: number
    backgroundReceived: number
    host: string
    checkIframes: boolean
}

export type TranslationProxy = (key: string) => string

export type SearchReplaceResult = {
    count: {
        original: number
        replaced: number
    }
    replaced: boolean
}

export type SearchReplaceConfig = {
    action: SearchReplaceBackgroundActions
    replace: boolean
    replaceNext: boolean
    replaceAll: boolean
    searchTerm: string
    replaceTerm: string
    flags: string
    inputFieldsOnly: boolean
    isRegex: boolean
    visibleOnly: boolean
    wholeWord: boolean
    searchPattern: RegExp
    globalSearchPattern: RegExp
    matchCase: boolean
    isIframe: boolean
    iframes: HTMLIFrameElement[]
    iframesOnDifferentHosts: boolean
    elementFilter: RegExp
    usesKnockout: boolean
}

export type SearchReplaceLocalStorageResultKey = `searchReplace-${string}`
export type SearchReplaceLocalStorageOriginKey = `searchReplace-origin-${string}`

export type SearchReplaceLocalStorage = {
    searchTerm: string
    replaceTerm: string
    searchReplaceResult: SearchReplaceResult
}
