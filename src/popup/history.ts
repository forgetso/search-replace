// function to expand or contract the history section
import { CHECKBOXES } from './constants'
import { SearchReplaceInstance, SearchReplaceOptions } from '../types'

export function historyHeaderClickHandler(e) {
    e.preventDefault()
    const historyContent = document.getElementById('historyContent')
    if (historyContent) {
        if (historyContent.style.display === 'block') {
            historyContent.style.display = 'none'
        } else {
            historyContent.style.display = 'block'
        }
    }
}

export function clearHistoryClickHandler(port: chrome.runtime.Port) {
    port.postMessage({ action: 'clearHistory' })
    const historyList = document.getElementById('historyList')
    if (historyList) {
        historyList.innerHTML = ''
    }
}

export function constructSearchReplaceHistory(searchReplaceInstance?: SearchReplaceInstance): SearchReplaceInstance[] {
    const history = document.getElementById('historyContent')
    let historyItems: SearchReplaceInstance[] = []
    if (history) {
        // scrape the history list from the UI list elements
        historyItems = getHistoryItemsFromListItemsElements(history)
        if (searchReplaceInstance) {
            // place the most recent item at the top of the list
            historyItems.unshift(searchReplaceInstance)
            // never store more than 10 history items
            historyItems = historyItems.slice(0, 10)
            // get unique items in list of objects
            historyItems = getUniqueHistoryItems(historyItems)
        }
        return historyItems
    }

    return historyItems
}

function getHistoryItemsFromListItemsElements(history: HTMLElement): SearchReplaceInstance[] {
    return Array.from(history.getElementsByTagName('li')).map((item) => ({
        searchTerm: item.getAttribute('data-searchTerm') || '',
        replaceTerm: item.getAttribute('data-replaceTerm') || '',
        instanceId: Number(item.getAttribute('data-instanceId') || ''),
        options: CHECKBOXES.reduce((result, checkboxName) => {
            result[checkboxName] = item.getAttribute(`data-${checkboxName}`) === 'true'
            return result
        }, {}) as SearchReplaceOptions,
    }))
}

function getUniqueHistoryItems(historyItems: SearchReplaceInstance[]) {
    return historyItems.filter(
        (item1, index, self) =>
            index ===
            self.findIndex((item2) => item2.searchTerm === item1.searchTerm && item2.replaceTerm === item1.replaceTerm)
    )
}
