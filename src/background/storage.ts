import { SavedInstances, SearchReplaceInstance, SearchReplacePopupStorage } from '../types'

export function getDefaultStorage(): SearchReplacePopupStorage {
    const instance: SearchReplaceInstance = {
        searchTerm: '',
        replaceTerm: '',
        options: {
            matchCase: false,
            inputFieldsOnly: true,
            visibleOnly: true,
            wholeWord: false,
            isRegex: false,
            replaceAll: true,
            save: false,
        },
    }
    const saved: SavedInstances = {}
    const history: SearchReplaceInstance[] = []
    return {
        storage: {
            instance,
            history,
            saved,
        },
    }
}

export function getStorage<T>(key: string): Promise<T | undefined> {
    return new Promise<T>((resolve) => {
        console.log('STORAGE: looking for storage with key', key)
        chrome.storage.local.get(key, function (items) {
            console.log('STORAGE: got items from storage', items)
            resolve(items[key])
        })
    })
}

export function getAllStorageKeys(keyFilter?: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        chrome.storage.local.get(null, function (items) {
            if (keyFilter) {
                resolve(
                    Object.keys(items)
                        .flat()
                        .filter((key) => key.includes(keyFilter))
                )
            } else {
                resolve(Object.keys(items).flat())
            }
        })
    })
}
