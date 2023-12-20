import {
    SearchReplaceLocalStorage,
    SearchReplaceLocalStorageOriginKey,
    SearchReplaceLocalStorageResultKey,
    SearchReplaceResult,
} from './types'

// Content script local storage functions
export function getLocalStorage(key: SearchReplaceLocalStorageResultKey): SearchReplaceLocalStorage | undefined {
    const searchReplaceStorage = localStorage.getItem(key)
    if (searchReplaceStorage) {
        return JSON.parse(searchReplaceStorage)
    }
    return undefined
}

export function setLocalStorage(
    searchTerm: string,
    replaceTerm: string,
    searchReplaceResult: SearchReplaceResult,
    location: string
) {
    const searchReplaceStorage: SearchReplaceLocalStorage = {
        searchTerm,
        replaceTerm,
        searchReplaceResult: searchReplaceResult,
    }
    localStorage.setItem(
        `searchReplace-${location}` as SearchReplaceLocalStorageResultKey,
        JSON.stringify(searchReplaceStorage)
    )
}

export function removeLocalStorage(key: SearchReplaceLocalStorageResultKey | SearchReplaceLocalStorageOriginKey) {
    localStorage.removeItem(key)
}

export function setParentOrigin(originKey: SearchReplaceLocalStorageOriginKey, origin: string) {
    console.log('Setting parent origin in', window.location.host, originKey, origin)
    localStorage.setItem(originKey, origin)
}

export function getParentOrigin(originKey: SearchReplaceLocalStorageOriginKey): string | null {
    return localStorage.getItem(originKey)
}
