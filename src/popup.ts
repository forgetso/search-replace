import {
    SearchReplaceBackgroundMessage,
    SearchReplaceCheckboxNames,
    SearchReplaceCommonActions,
    SearchReplaceContentMessage,
    SearchReplaceInstance,
    SearchReplaceOptions,
    SearchReplaceResponse,
    SearchReplaceResult,
    SearchReplaceStorageItems,
    TranslationProxy,
} from './types'
import { createTranslationProxy, getInstanceId, getTranslation, localizeElements, manifest, tabConnect } from './util'

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

function getSearchTermElement() {
    return <HTMLTextAreaElement>document.getElementById('searchTerm')
}

function getReplaceTermElement() {
    return <HTMLTextAreaElement>document.getElementById('replaceTerm')
}

const CHECKBOXES: SearchReplaceCheckboxNames[] = Object.values(SearchReplaceCheckboxNames)
const MIN_SEARCH_TERM_LENGTH = 1
window.addEventListener('DOMContentLoaded', async function () {
    const langData = await getTranslation()
    const translationFn = createTranslationProxy(langData)

    // Create a variable for storing the time since last time terms were stored

    // Update popup version number and GitHub link dynamically with manifest.version
    const versionNumberElement = document.getElementById('version_number')
    if (versionNumberElement) {
        versionNumberElement.innerHTML = manifest.version
    }
    const githubVersionElement = document.getElementById('github_version') as HTMLAnchorElement
    if (githubVersionElement) {
        githubVersionElement.href = `https://github.com/forgetso/search-replace/releases/tag/${manifest.version}`
    }

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
    port.postMessage({ action: 'recover' })

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
        contentScriptCall('count', recentSearch, history, translationFn, contentScriptCallback).then((r) =>
            console.log(r)
        )
    })
    ;(<HTMLButtonElement>document.querySelector('#historyHeader')).addEventListener('click', historyHeaderClickHandler)

    // Replace Next anb ReplaceAll click handlers
    for (const elementId of ['#replaceNext', '#replaceAll']) {
        ;(<HTMLFormElement>document.querySelector(elementId)).addEventListener('click', function (event) {
            event.preventDefault()
            formSubmitHandler(
                'searchReplace',
                translationFn,
                contentScriptCallback,
                elementId.slice(1) === 'replaceAll'
            )
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
            ;(<HTMLInputElement>document.getElementById(elementName)).addEventListener(eventType, (e) =>
                storeTermsHandler(e, translationFn)
            )
        }
    }

    // Handler for auto resizing the textareas
    for (const elementName of ['searchTerm', 'replaceTerm']) {
        const element = document.getElementById(elementName)
        autoGrow(element)
        ;(<HTMLTextAreaElement>element).addEventListener('input', function () {
            autoGrow(this)
        })
    }

    // Click handler for historyContent element. Will take the search term and replace term from the history item and populate the input fields
    ;(<HTMLDivElement>document.getElementById('historyContent')).addEventListener('click', (e) =>
        historyItemClickHandler(e, translationFn)
    )

    // Click handler for swapping terms
    ;(<HTMLButtonElement>document.getElementById('swapTerms')).addEventListener('click', function (e) {
        const searchTerm = getSearchTermElement()
        const replaceTerm = getReplaceTermElement()
        swapTerms(searchTerm, replaceTerm, translationFn)
        autoGrow(searchTerm)
        autoGrow(replaceTerm)
    })
    // Localize HTML elements
    localizeElements(langData)
})

async function storeTermsHandler(e, translationFn: TranslationProxy) {
    await storeTerms(e, translationFn, false)
}

// function to change the height of the textarea to fit the content
function autoGrow(element) {
    element.style.height = 'auto'
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
    port.postMessage({ action: 'clearHistory' })
    const historyList = document.getElementById('historyList')
    if (historyList) {
        historyList.innerHTML = ''
    }
}

function restoreSearchReplaceInstance(searchReplaceInstance: SearchReplaceInstance) {
    const searchTerm = getSearchTermElement()
    const replaceTerm = getReplaceTermElement()
    searchTerm.value = searchReplaceInstance.searchTerm
    replaceTerm.value = searchReplaceInstance.replaceTerm
    for (const checkbox of CHECKBOXES) {
        ;(<HTMLInputElement>document.getElementById(checkbox)).checked = searchReplaceInstance.options[checkbox]
    }
    // Resize the text areas after populating the saved terms
    autoGrow(searchTerm)
    autoGrow(replaceTerm)
}

function historyItemClickHandler(e, translationFn: TranslationProxy) {
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
        storeTerms(e, translationFn, false)
            .then((r) => {
                console.log(r)
            })
            .catch((e) => console.error(e))
    }
}

/** The handler for searching and replacing in the tab
 * @param action
 * @param translationFn
 * @param callbackHandler {function}
 * @param replaceAll
 **/
function formSubmitHandler(
    action: SearchReplaceCommonActions,
    translationFn: TranslationProxy,
    callbackHandler: (msg: any, translationFn: TranslationProxy) => void,
    replaceAll: boolean
) {
    const loader = document.getElementById('loader')
    if (loader) loader.style.display = 'block'
    const content = document.getElementById('content')
    if (content) content.style.display = 'none'
    const searchReplaceInstance = getInputValues(replaceAll)
    const historyItems = constructSearchReplaceHistory(searchReplaceInstance)
    // create the new history list items
    createHistoryListItemElements(historyItems)
    // store the new history list items
    storeTerms({}, translationFn, true)
        .then((r) => console.log(r))
        .catch((e) => console.error(e))
    // do the search replace
    contentScriptCall(action, searchReplaceInstance, historyItems, translationFn, callbackHandler)
        .then((r) => console.log(r))
        .catch((e) => console.error(e))
}

/** Send the search and replace instance to the content script for processing **/
export async function contentScriptCall(
    action: SearchReplaceCommonActions,
    searchReplaceInstance: SearchReplaceInstance,
    history: SearchReplaceInstance[],
    translationFn: TranslationProxy,
    callbackHandler: typeof contentScriptCallback
): Promise<string | undefined> {
    const query = { active: true, currentWindow: true }
    let url: string | undefined = undefined
    const [tab] = await chrome.tabs.query(query)
    if (tab.id != null) {
        const instanceId = getInstanceId({ ...searchReplaceInstance, url: tab.url ? tab.url : '' }, true)
        const message: SearchReplaceContentMessage = {
            action,
            instance: searchReplaceInstance,
            history,
            url: tab.url,
            instanceId,
        }

        console.log('POPUP: sending message to tab', message)
        chrome.tabs.sendMessage(tab.id, message, function (response) {
            callbackHandler(response, translationFn)
        })
        url = tab.url
    }
    return url
}

function contentScriptCallback(msg: SearchReplaceResponse, translationFn: TranslationProxy) {
    removeLoader()
    console.log('POPUP: tabQueryCallback', msg)
    if (msg.action === 'searchReplaceResponse') {
        setCount(msg.result, translationFn)
        setHints(msg.hints)
    }
}

function setCount(result: SearchReplaceResult, translationFn: TranslationProxy) {
    if (getSearchTermElement().value.length >= MIN_SEARCH_TERM_LENGTH) {
        ;(<HTMLDivElement>document.getElementById('searchTermCount')).innerHTML = `${
            result.count.original - result.count.replaced
        } ${translationFn('matches')}`
    } else {
        ;(<HTMLDivElement>document.getElementById('searchTermCount')).innerHTML = ''
    }
}

function setHints(hints?: string[]) {
    const hintsElement = document.getElementById('hints')
    if (hintsElement) {
        hintsElement.innerHTML = ''
        if (hints) {
            console.log('POPUP: got hints ', hints)
            for (const hint of hints) {
                const hintElement = document.createElement('div')
                hintElement.innerText = hint
                hintElement.className = 'hint alert alert-info'
                hintsElement.appendChild(hintElement)
            }
        }
    }
}

function removeLoader() {
    const loader = document.getElementById('loader')
    if (loader) loader.style.display = 'none'
    const content = document.getElementById('content')
    if (content) content.style.display = 'block'
}

/** Stores the terms from the popup and performs a count of the terms on the page **/
async function storeTerms(e, translationFn: TranslationProxy, save?: boolean, ignoreLength?: boolean) {
    console.debug('storing terms')
    e = e || window.event
    if (e.keyCode === 13) {
        //if the user presses enter we want to trigger the search replace
        formSubmitHandler('searchReplace', translationFn, contentScriptCallback, false)
    } else {
        const searchReplaceInput = getInputValues(false)
        const history = constructSearchReplaceHistory()

        if (searchReplaceInput.searchTerm.length >= MIN_SEARCH_TERM_LENGTH || ignoreLength) {
            // This counts the terms on the page
            const url = await contentScriptCall(
                'count',
                searchReplaceInput,
                history,
                translationFn,
                contentScriptCallback
            )
            // This sends the search replace terms to the background page and stores them
            sendToStorage(searchReplaceInput, history, url, save)
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

    // First store the Search Replace instance
    const message: SearchReplaceBackgroundMessage = {
        storage: {
            instance: searchReplaceInstance,
            history,
        },
        action: 'store',
        url,
    }
    port.postMessage(message)

    // If the user has asked to save the instance, send a subsequent message to the background page telling it to save it
    if (save) {
        message.action = 'save'
        port.postMessage(message)
    }
}

chrome.runtime.onMessage.addListener(function (msg: SearchReplaceResponse) {
    console.log('POPUP: Message received: ' + JSON.stringify(msg))
    if (msg.action === 'searchReplaceResponse') {
        getTranslation().then((langData) => {
            const translationFn = createTranslationProxy(langData)
            contentScriptCallback(msg, translationFn)
        })
    }
})

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

function swapTerms(source: HTMLTextAreaElement, target: HTMLTextAreaElement, translationFn: TranslationProxy) {
    const sourceText = source.value
    source.value = target.value
    target.value = sourceText
    storeTerms({}, translationFn, true, true)
        .then((r) => console.log(`swapTerms response: ${r}`))
        .catch((e) => console.error(e))
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

function getInputValues(replaceAll: boolean): SearchReplaceInstance {
    const searchTerm = getSearchTermElement().value || ''
    const replaceTerm = getReplaceTermElement().value || ''
    const matchCase = (<HTMLInputElement>document.getElementById('matchCase')).checked
    const inputFieldsOnly = (<HTMLInputElement>document.getElementById('inputFieldsOnly')).checked
    const visibleOnly = (<HTMLInputElement>document.getElementById('visibleOnly')).checked
    const wholeWord = (<HTMLInputElement>document.getElementById('wholeWord')).checked
    const isRegex = (<HTMLInputElement>document.getElementById('isRegex')).checked
    const save = (<HTMLInputElement>document.getElementById('save')).checked
    const instance: SearchReplaceInstance = {
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

    return {
        ...instance,
        instanceId: getInstanceId(instance, false),
    }
}

function openLink(link: string) {
    chrome.tabs.create({
        url: `assets/${link}.html`,
    })
}
