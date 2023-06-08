import {
    SearchReplaceAction,
    SearchReplaceCheckboxNames,
    SearchReplaceInstance,
    SearchReplaceMessage,
    SearchReplaceOptions,
    SearchReplaceStorageMessage,
} from './types'

const { matchCase, inputFieldsOnly, visibleOnly, wholeWord, isRegex } = SearchReplaceCheckboxNames

const INPUT_ELEMENTS_AND_EVENTS = {
    searchTerm: ['change', 'keyup', 'blur'],
    replaceTerm: ['change', 'keyup', 'blur'],
    [matchCase]: ['change', 'click'],
    [inputFieldsOnly]: ['change', 'click'],
    [visibleOnly]: ['change', 'click'],
    [wholeWord]: ['change', 'click'],
    [isRegex]: ['change'],
    help: ['click'],
}

const CHECKBOXES: SearchReplaceCheckboxNames[] = Object.values(SearchReplaceCheckboxNames)
const MIN_SEARCH_TERM_LENGTH = 2

document.addEventListener('DOMContentLoaded', function () {
    // Set the onchange and onkeydown functions for the input fields
    const inputs: HTMLCollectionOf<Element> = document.getElementsByClassName('data_field')
    for (const el of inputs) {
        const inputElement = <HTMLInputElement>el
        inputElement.onkeydown = inputElement.onchange = function () {
            console.debug('Set the onchange and onkeydown functions for the input fields')
        }
    }

    // Get the stored values from the background page
    const port = tabConnect()
    port.postMessage({
        recover: true,
    })

    // Restore the recent search replace instance and history list from storage
    port.onMessage.addListener(function (msg) {
        const history: SearchReplaceInstance[] = msg.history || []
        let recentSearch: SearchReplaceInstance = msg.instance
        if (history.length > 0) {
            recentSearch = history[0] || []
            restoreSearchReplaceInstance(recentSearch)
            createHistoryListItemElements(history)
        }
    })
    ;(<HTMLButtonElement>document.querySelector('#historyHeader')).addEventListener('click', historyHeaderClickHandler)

    //Click events for Replace Next, Replace All, Help link, and Clear History
    ;(<HTMLButtonElement>document.querySelector('#next')).addEventListener('click', function () {
        clickHandler('searchReplace', false, tabQueryCallback)
    })
    ;(<HTMLButtonElement>document.querySelector('#all')).addEventListener('click', function () {
        clickHandler('searchReplace', true, tabQueryCallback)
    })
    ;(<HTMLButtonElement>document.querySelector('#clearHistory')).addEventListener('click', clearHistoryClickHandler)
    ;(<HTMLAnchorElement>document.getElementById('help')).addEventListener('click', openHelp)

    // Handlers for input elements changing value - storeTerms
    for (const elementName in INPUT_ELEMENTS_AND_EVENTS) {
        for (const eventType of INPUT_ELEMENTS_AND_EVENTS[elementName]) {
            ;(<HTMLInputElement>document.getElementById(elementName)).addEventListener(eventType, storeTerms)
        }
    }

    // Click handler for historyContent element. Will take the search term and replace term from the history item and populate the input fields
    ;(<HTMLDivElement>document.getElementById('historyContent')).addEventListener('click', historyItemClickHandler)
})

// function to expand or contract the history section
function historyHeaderClickHandler(e) {
    const historyContent = document.getElementById('historyContent')
    if (historyContent) {
        if (historyContent.style.display === 'block') {
            historyContent.style.display = 'none'
        } else {
            historyContent.style.display = 'block'
        }
    }
}

function clearHistoryClickHandler() {
    const port = tabConnect()
    port.postMessage({
        clearHistory: true,
    })
    const historyList = document.getElementById('historyList')
    if (historyList) {
        historyList.innerHTML = ''
    }
}

function restoreSearchReplaceInstance(searchReplaceInstance: SearchReplaceInstance) {
    ;(<HTMLInputElement>document.getElementById('searchTerm')).value = searchReplaceInstance.searchTerm
    ;(<HTMLInputElement>document.getElementById('replaceTerm')).value = searchReplaceInstance.replaceTerm

    for (const checkbox of CHECKBOXES) {
        ;(<HTMLInputElement>document.getElementById(checkbox)).checked = searchReplaceInstance.options[checkbox]
    }
}

function historyItemClickHandler(e) {
    const target = <HTMLElement>e.target

    if (target.tagName === 'LI') {
        const options: SearchReplaceOptions = CHECKBOXES.reduce((result, checkboxName) => {
            result[checkboxName] = target.getAttribute(`data-${checkboxName}`) === 'true'
            return result
        }, {}) as SearchReplaceOptions

        const searchReplaceInstance: SearchReplaceInstance = {
            searchTerm: target.getAttribute('data-searchTerm') || '',
            replaceTerm: target.getAttribute('data-replaceTerm') || '',
            options,
        }
        restoreSearchReplaceInstance(searchReplaceInstance)
        storeTerms(e)
    }
}

function clickHandler(action: SearchReplaceAction, replaceAll: boolean, callbackHandler) {
    const loader = document.getElementById('loader')
    loader!.style.display = 'block'
    const content = document.getElementById('content')
    content!.style.display = 'none'
    const searchReplaceInstance = getInputValues()
    const historyItems = constructSearchReplaceHistory(searchReplaceInstance)
    // create the new history list items
    createHistoryListItemElements(historyItems)
    // store the new history list items
    storeTerms({})
    // do the search replace
    tabQuery(action, searchReplaceInstance, replaceAll, historyItems, callbackHandler)
}

function tabQuery(
    action: SearchReplaceAction,
    searchReplaceInstance: SearchReplaceInstance,
    replaceAll: boolean,
    history: SearchReplaceInstance[],
    callbackHandler
) {
    const query = { active: true, currentWindow: true }
    chrome.tabs.query(query, function (tabs) {
        const tab = tabs[0]
        if (tab.id != null) {
            const message: SearchReplaceMessage = {
                action,
                instance: searchReplaceInstance,
                history,
                replaceAll,
                url: tab.url,
            }
            chrome.tabs.sendMessage(tab.id, message, function (response) {
                callbackHandler(response)
            })
        }
    })
}

function tabQueryCallback(msg) {
    removeLoader()
    if (msg) {
        if ('searchTermCount' in msg && 'inIframe' in msg && msg['inIframe'] === false) {
            ;(<HTMLInputElement>document.getElementById('searchTermCount')).innerText =
                msg['searchTermCount'] + ' matches'
        }
    }
}

function removeLoader() {
    const loader = document.getElementById('loader')
    loader!.style.display = 'none'
    const content = document.getElementById('content')
    content!.style.display = 'block'
}

function storeTerms(e) {
    console.debug('storing terms')
    e = e || window.event
    if (e.keyCode === 13) {
        //if the user presses enter we want to trigger the search replace
        clickHandler('searchReplace', false, tabQueryCallback)
    } else {
        const searchReplaceInput = getInputValues()
        const history = constructSearchReplaceHistory()
        sendToStorage(searchReplaceInput, history)
        if (searchReplaceInput.searchTerm.length > MIN_SEARCH_TERM_LENGTH) {
            tabQuery('store', searchReplaceInput, true, history, tabQueryCallback)
        } else {
            tabQueryCallback({})
        }
    }
}

function sendToStorage(searchReplaceInstance: SearchReplaceInstance, history: SearchReplaceInstance[]) {
    // Send the search and replace terms to the background page
    const port = tabConnect()
    const storageMessage: SearchReplaceStorageMessage = {
        instance: searchReplaceInstance,
        history,
        recover: false,
    }
    port.postMessage(storageMessage)
    port.onMessage.addListener(function (msg) {
        console.debug('Message received: ' + msg)
    })
}

function createHistoryListItemElements(history: SearchReplaceInstance[]) {
    if (history.length > 0) {
        const historyContent = document.getElementById('historyList')
        if (historyContent) {
            historyContent.innerHTML = ''

            for (const [index, item] of history.entries()) {
                const li = document.createElement('li')
                li.setAttribute(`data-searchTerm`, item['searchTerm'])
                li.setAttribute(`data-replaceTerm`, item['replaceTerm'])
                for (const checkbox of CHECKBOXES) {
                    const checked = checkbox in item.options ? item.options[checkbox] : false
                    li.setAttribute(`data-${checkbox}`, String(checked))
                }
                li.setAttribute('class', `historyRow-${index % 2}`)

                li.innerText = item.searchTerm + ' -> ' + item.replaceTerm
                historyContent.appendChild(li)
            }
        }
    }
}

function constructSearchReplaceHistory(searchReplaceInstance?: SearchReplaceInstance): SearchReplaceInstance[] {
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

function tabConnect() {
    return chrome.runtime.connect(null!, {
        name: 'Search and Replace',
    })
}

function getInputValues(): SearchReplaceInstance {
    const searchTerm = (<HTMLInputElement>document.getElementById('searchTerm')).value || ''
    const replaceTerm = (<HTMLInputElement>document.getElementById('replaceTerm')).value || ''
    const matchCase = (<HTMLInputElement>document.getElementById('matchCase')).checked
    const inputFieldsOnly = (<HTMLInputElement>document.getElementById('inputFieldsOnly')).checked
    const visibleOnly = (<HTMLInputElement>document.getElementById('visibleOnly')).checked
    const wholeWord = (<HTMLInputElement>document.getElementById('wholeWord')).checked
    const isRegex = (<HTMLInputElement>document.getElementById('isRegex')).checked
    return {
        searchTerm,
        replaceTerm,
        options: {
            matchCase,
            inputFieldsOnly,
            visibleOnly,
            wholeWord,
            isRegex,
        },
    }
}

function openHelp() {
    chrome.tabs.create({
        url: 'assets/help.html',
    })
}
