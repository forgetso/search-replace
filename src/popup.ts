import {
    SearchReplaceAction,
    SearchReplaceCheckboxNames,
    SearchReplaceInstance,
    SearchReplaceMessage,
    SearchReplaceOptions,
    SearchReplaceStorageItems,
    SearchReplaceStorageMessage,
} from './types'
import { clearHistoryMessage, recoverMessage, tabConnect } from './util'

const { matchCase, inputFieldsOnly, visibleOnly, wholeWord, isRegex, save, replaceAll } = SearchReplaceCheckboxNames

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
const MIN_SEARCH_TERM_LENGTH = 1
window.addEventListener('DOMContentLoaded', function () {
    // Create a variable for storing the time since last time terms were stored

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
    port.postMessage(recoverMessage)

    // Restore the recent search replace instance and history list from storage
    port.onMessage.addListener(function (msg: SearchReplaceStorageItems) {
        const history: SearchReplaceInstance[] = msg.history || []
        let recentSearch: SearchReplaceInstance = msg.instance
        if (history.length > 0) {
            recentSearch = recentSearch || history[0]
            createHistoryListItemElements(history)
        }
        if (recentSearch) {
            restoreSearchReplaceInstance(recentSearch)
        }
        // Trigger a search term count if there is an existing search term
        tabQuery('store', recentSearch, history, tabQueryCallback).then((r) => console.log(r))
    })
    ;(<HTMLButtonElement>document.querySelector('#historyHeader')).addEventListener('click', historyHeaderClickHandler)

    // Replace Next anb ReplaceAll click handlers
    for (const elementId of ['#replaceNext', '#replaceAll']) {
        ;(<HTMLFormElement>document.querySelector(elementId)).addEventListener('click', function (event) {
            event.preventDefault()
            formSubmitHandler('searchReplace', tabQueryCallback, elementId.slice(1) === 'replaceAll')
        })
    }

    // Form submit handler
    ;(<HTMLFormElement>document.querySelector('#searchReplaceForm')).addEventListener('submit', function (event) {
        event.preventDefault()
    })

    //Click events for Options Link, Help link, and Clear History
    ;(<HTMLButtonElement>document.querySelector('#clearHistory')).addEventListener('click', clearHistoryClickHandler)
    for (const link of ['help', 'options']) {
        ;(<HTMLAnchorElement>document.getElementById(link)).addEventListener('click', function () {
            openLink(link)
        })
    }

    // Handlers for input elements changing value - storeTerms
    for (const elementName in INPUT_ELEMENTS_AND_EVENTS) {
        for (const eventType of INPUT_ELEMENTS_AND_EVENTS[elementName]) {
            ;(<HTMLInputElement>document.getElementById(elementName)).addEventListener(eventType, storeTermsHandler)
        }
    }

    // Handler for auto resizing the textareas
    for (const elementName of ['searchTerm', 'replaceTerm']) {
        ;(<HTMLTextAreaElement>document.getElementById(elementName)).addEventListener('input', function () {
            autoGrow(this)
        })
    }

    // Click handler for historyContent element. Will take the search term and replace term from the history item and populate the input fields
    ;(<HTMLDivElement>document.getElementById('historyContent')).addEventListener('click', historyItemClickHandler)

    // Click handler for swapping terms
    ;(<HTMLButtonElement>document.getElementById('swapTerms')).addEventListener('click', function (e) {
        const searchTerm = <HTMLTextAreaElement>document.getElementById('searchTerm')
        const replaceTerm = <HTMLTextAreaElement>document.getElementById('replaceTerm')
        swapTerms(searchTerm, replaceTerm)
    })
})

async function storeTermsHandler(e) {
    await storeTerms(e, false)
}

// function to change the height of the textarea to fit the content
function autoGrow(element) {
    console.log('change height')
    element.style.height = ''
    element.style.height = element.scrollHeight + 'px'
}

// function to expand or contract the history section
function historyHeaderClickHandler(e) {
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

function clearHistoryClickHandler() {
    const port = tabConnect()
    port.postMessage(clearHistoryMessage)
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
        storeTerms(e, false)
            .then((r) => {
                console.log(r)
            })
            .catch((e) => console.error(e))
    }
}

/** The handler for searching and replacing in the tab
 * @param action {SearchReplaceAction}
 * @param callbackHandler {function}
 **/
function formSubmitHandler(action: SearchReplaceAction, callbackHandler, replaceAll: boolean) {
    const loader = document.getElementById('loader')
    loader!.style.display = 'block'
    const content = document.getElementById('content')
    content!.style.display = 'none'
    const searchReplaceInstance = getInputValues(replaceAll)
    const historyItems = constructSearchReplaceHistory(searchReplaceInstance)
    // create the new history list items
    createHistoryListItemElements(historyItems)
    // store the new history list items
    storeTerms({}, true)
    // do the search replace
    tabQuery(action, searchReplaceInstance, historyItems, callbackHandler)
}

/** Send the search and replace instance to the content script for processing **/
export async function tabQuery(
    action: SearchReplaceAction,
    searchReplaceInstance: SearchReplaceInstance,
    history: SearchReplaceInstance[],
    callbackHandler
): Promise<string | undefined> {
    const query = { active: true, currentWindow: true }
    let url: string | undefined = undefined
    const [tab] = await chrome.tabs.query(query)
    if (tab.id != null) {
        const message: SearchReplaceMessage = {
            action,
            instance: searchReplaceInstance,
            history,
            url: tab.url,
        }
        console.log('sending message to tab', message)
        chrome.tabs.sendMessage(tab.id, message, function (response) {
            callbackHandler(response)
        })
        url = tab.url
    }
    return url
}

function tabQueryCallback(msg) {
    removeLoader()
    if (msg && 'inIframe' in msg && msg['inIframe'] === false) {
        if ('searchTermCount' in msg) {
            ;(<HTMLDivElement>(
                document.getElementById('searchTermCount')
            )).innerHTML = `${msg['searchTermCount']} matches`
        }
        const hintsElement = document.getElementById('hints')

        if (hintsElement) {
            hintsElement.innerHTML = ''
            if ('hints' in msg) {
                console.log('got hints ', msg['hints'])
                for (const hint of msg['hints']) {
                    const hintElement = document.createElement('div')
                    hintElement.innerText = hint
                    hintElement.className = 'hint alert alert-info'
                    hintsElement.appendChild(hintElement)
                }
            }
        }
    }
}

function removeLoader() {
    const loader = document.getElementById('loader')
    loader!.style.display = 'none'
    const content = document.getElementById('content')
    content!.style.display = 'block'
}

async function storeTerms(e, save?: boolean) {
    console.debug('storing terms')
    e = e || window.event
    if (e.keyCode === 13) {
        //if the user presses enter we want to trigger the search replace
        formSubmitHandler('searchReplace', tabQueryCallback, false)
    } else {
        const searchReplaceInput = getInputValues(false)
        const history = constructSearchReplaceHistory()

        if (searchReplaceInput.searchTerm.length >= MIN_SEARCH_TERM_LENGTH) {
            // This does the actual search replace
            const url = await tabQuery('store', searchReplaceInput, history, tabQueryCallback)
            // This sends the search replace terms to the background page and stores them
            sendToStorage(searchReplaceInput, history, url, save)
        } else {
            tabQueryCallback({})
        }
    }
}

function sendToStorage(
    searchReplaceInstance: SearchReplaceInstance,
    history: SearchReplaceInstance[],
    url?: string,
    save?: boolean
) {
    // Send the search and replace terms to the background page
    const port = tabConnect()
    const storageMessage: SearchReplaceStorageMessage = {
        storage: {
            instance: searchReplaceInstance,
            history,
        },
        actions: { store: true, save },
        url,
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

function swapTerms(source: HTMLTextAreaElement, target: HTMLTextAreaElement) {
    const sourceText = source.value
    source.value = target.value
    target.value = sourceText
    storeTerms({}, true)
        .then((r) => console.log(r))
        .catch((e) => console.error(e))
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

function getInputValues(replaceAll: boolean): SearchReplaceInstance {
    const searchTerm = (<HTMLInputElement>document.getElementById('searchTerm')).value || ''
    const replaceTerm = (<HTMLInputElement>document.getElementById('replaceTerm')).value || ''
    const matchCase = (<HTMLInputElement>document.getElementById('matchCase')).checked
    const inputFieldsOnly = (<HTMLInputElement>document.getElementById('inputFieldsOnly')).checked
    const visibleOnly = (<HTMLInputElement>document.getElementById('visibleOnly')).checked
    const wholeWord = (<HTMLInputElement>document.getElementById('wholeWord')).checked
    const isRegex = (<HTMLInputElement>document.getElementById('isRegex')).checked
    const save = (<HTMLInputElement>document.getElementById('save')).checked
    return {
        searchTerm,
        replaceTerm,
        options: {
            matchCase,
            inputFieldsOnly,
            visibleOnly,
            wholeWord,
            isRegex,
            replaceAll,
            save,
        },
    }
}

function openLink(link: string) {
    chrome.tabs.create({
        url: `assets/${link}.html`,
    })
}
