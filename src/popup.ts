import {
    CHECKBOXES,
    INPUT_ELEMENTS_AND_EVENTS,
    MIN_SEARCH_TERM_LENGTH,
    REPLACE_TERM_INPUT_ID,
    SEARCH_TERM_INPUT_ID,
} from './popup/constants'
import {
    SearchReplaceActions,
    SearchReplaceBackgroundMessage,
    SearchReplaceContentMessage,
    SearchReplaceInstance,
    SearchReplaceOptions,
    SearchReplaceResponse,
    SearchReplaceResult,
    SearchReplaceStorageItems,
    TranslationProxy,
} from './types'
import { clearHistoryClickHandler, constructSearchReplaceHistory, historyHeaderClickHandler } from './popup/history'
import { createTranslationProxy, getInstanceId, getTranslation, localizeElements, manifest, tabConnect } from './util'

const RELEASE_NOTES_URL = 'https://github.com/forgetso/search-replace/releases/tag'

function getSearchTermElement() {
    return <HTMLTextAreaElement>document.getElementById(SEARCH_TERM_INPUT_ID)
}

function getReplaceTermElement() {
    return <HTMLTextAreaElement>document.getElementById(REPLACE_TERM_INPUT_ID)
}
/**
 * The onload function for the popup page. Sets the elements to their stored values and sets the event handlers
 */
window.addEventListener('DOMContentLoaded', async function () {
    const langData = await getTranslation()
    const translationFn = createTranslationProxy(langData)

    // Update popup version number and GitHub link dynamically with manifest.version
    const versionNumberElement = document.getElementById('version_number')
    if (versionNumberElement) {
        versionNumberElement.innerHTML = manifest.version
    }
    const githubVersionElement = document.getElementById('github_version') as HTMLAnchorElement
    if (githubVersionElement) {
        githubVersionElement.href = `${RELEASE_NOTES_URL}/${manifest.version}`
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
        contentScriptCall('count', recentSearch, history).catch((e) => {
            console.error(e)
        })
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
    ;(<HTMLButtonElement>document.querySelector('#clearHistory')).addEventListener('click', function () {
        clearHistoryClickHandler(tabConnect())
    })
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
    for (const elementName of [SEARCH_TERM_INPUT_ID, REPLACE_TERM_INPUT_ID]) {
        const element = <HTMLTextAreaElement | null>document.getElementById(elementName)
        if (element) {
            autoGrow(element)
        }
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

async function storeTermsHandler(e: Event, translationFn: TranslationProxy) {
    await storeTerms(e, translationFn, false)
}

// function to change the height of the textarea to fit the content
function autoGrow(element: HTMLTextAreaElement) {
    element.style.height = 'auto'
    element.style.height = element.scrollHeight + 'px'
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

/** The handler for clicking on a history item
 * Will take the search term and replace term from the history item and populate the input fields
 * @param e
 * @param translationFn
 */
export function historyItemClickHandler(e, translationFn: TranslationProxy) {
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
        storeTerms(e, translationFn, false).catch((e) => console.error(e))
    }
}

/** The handler for searching and replacing in the tab
 * @param action
 * @param translationFn
 * @param callbackHandler {function}
 * @param replaceAll
 **/
async function formSubmitHandler(
    action: SearchReplaceActions,
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
    await storeTerms(new Event('storeTerms'), translationFn, true)
    // do the search replace
    await contentScriptCall(action, searchReplaceInstance, historyItems)
}

/** Send the search and replace instance to the content script for processing, clearing any saved responses first.
 * @param action
 * @param searchReplaceInstance
 * @param history
 * **/
export async function contentScriptCall(
    action: SearchReplaceActions,
    searchReplaceInstance: SearchReplaceInstance,
    history: SearchReplaceInstance[]
): Promise<string | undefined> {
    // must do this before calling the content script
    await chrome.runtime.sendMessage({ action: 'clearSavedResponses' })
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

        await chrome.tabs.sendMessage(tab.id, message)
        url = tab.url
    }
    return url
}

/** The callback function for the content script
 * @param msg {SearchReplaceResponse}
 * @param translationFn
 */
function contentScriptCallback(msg: SearchReplaceResponse, translationFn: TranslationProxy) {
    removeLoader()
    if (msg && msg.action === 'searchReplaceResponseMerged') {
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
async function storeTerms(
    event: Event | KeyboardEvent,
    translationFn: TranslationProxy,
    save?: boolean,
    ignoreLength?: boolean
) {
    console.debug('storing terms')
    event = event || new Event('storeTerms')
    if (event instanceof KeyboardEvent && event.code === 'Enter') {
        //if the user presses enter we want to trigger the search replace
        await formSubmitHandler('searchReplace', translationFn, contentScriptCallback, false)
    } else {
        const searchReplaceInput = getInputValues(false)
        const history = constructSearchReplaceHistory()

        if (searchReplaceInput.searchTerm.length >= MIN_SEARCH_TERM_LENGTH || ignoreLength) {
            // This counts the terms on the page
            const url = await contentScriptCall('count', searchReplaceInput, history)
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
    if (msg && (msg.action === 'searchReplaceResponse' || msg.action === 'searchReplaceResponseMerged')) {
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
                li.setAttribute(`data-searchTerm`, item[SEARCH_TERM_INPUT_ID])
                li.setAttribute(`data-replaceTerm`, item[REPLACE_TERM_INPUT_ID])
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

function swapTerms(source: HTMLTextAreaElement, target: HTMLTextAreaElement, translationFn: TranslationProxy) {
    const sourceText = source.value
    source.value = target.value
    target.value = sourceText
    storeTerms(new Event('storeTerms'), translationFn, true, true).catch((e) => console.error(e))
}

function getInputValues(replaceAll: boolean): SearchReplaceInstance {
    const searchTerm = getSearchTermElement().value || ''
    const replaceTerm = getReplaceTermElement().value || ''
    const matchCase = (<HTMLInputElement>document.getElementById('matchCase')).checked
    const inputFieldsOnly = (<HTMLInputElement>document.getElementById('inputFieldsOnly')).checked
    const visibleOnly = (<HTMLInputElement>document.getElementById('visibleOnly')).checked
    const wholeWord = (<HTMLInputElement>document.getElementById('wholeWord')).checked
    const isRegex = (<HTMLInputElement>document.getElementById('isRegex')).checked
    const replaceHTML = (<HTMLInputElement>document.getElementById('replaceHTML')).checked
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
            replaceHTML,
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
