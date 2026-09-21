import {
    CHECKBOXES,
    INPUT_ELEMENTS_AND_EVENTS,
    MIN_SEARCH_TERM_LENGTH,
    REPLACE_TERM_INPUT_ID,
    SEARCH_TERM_INPUT_ID,
} from './popup/constants'
import {
    Hint,
    HintPreferences,
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
import { clearHistoryClickHandler, constructSearchReplaceHistory } from './popup/history'
import {
    createTranslationProxy,
    getAvailableLanguages,
    getInstanceId,
    getTranslation,
    localizeElements,
    manifest,
    tabConnect,
} from './util'
import { getRemainingMatchCount } from './popup/count'

// Enum for content types
enum ContentType {
    Setting = 'settingSection',
    SearchForm = 'searchReplaceForm',
    About = 'aboutSection',
    History = 'historySection',
}

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

    // Display searchReplaceForm as a default
    loadContent(ContentType.SearchForm)
    // Change the content when the icon is pressed (setting | about | history)
    ;(<HTMLButtonElement>document.querySelector('#setting')).addEventListener('click', function () {
        loadContent(ContentType.Setting)
    })

    // Change the content when the icon is pressed (setting | about | history)
    ;(<HTMLButtonElement>document.querySelector('#about')).addEventListener('click', function () {
        loadContent(ContentType.About)
    })

    // Change the content when the icon is pressed (setting | about | history)
    ;(<HTMLButtonElement>document.querySelector('#history')).addEventListener('click', function () {
        loadContent(ContentType.History)
    })

    // Click the back button, return main popup
    ;(<HTMLButtonElement>document.querySelector('#settingSection #back')).addEventListener('click', function () {
        loadContent(ContentType.SearchForm)
    })
    // Click the back button, return main popup
    ;(<HTMLButtonElement>document.querySelector('#aboutSection #back')).addEventListener('click', function () {
        loadContent(ContentType.SearchForm)
    })
    // Click the back button, return main popup
    ;(<HTMLButtonElement>document.querySelector('#historySection #back')).addEventListener('click', function () {
        loadContent(ContentType.SearchForm)
    })

    //Click events for Options Link, Help link, and Clear History
    ;(<HTMLButtonElement>document.querySelector('#clearHistory')).addEventListener('click', function () {
        clearHistoryClickHandler(tabConnect())
    })

    for (const link of ['help', 'saveRules']) {
        ;(<HTMLAnchorElement>document.getElementById(link)).addEventListener('click', function () {
            openLink(link)
        })
    }

    // Handlers for input elements changing value - storeTerms
    for (const elementName in INPUT_ELEMENTS_AND_EVENTS) {
        for (const eventType of INPUT_ELEMENTS_AND_EVENTS[elementName]) {
            ;(<HTMLInputElement>document.getElementById(elementName)).addEventListener(eventType, () =>
                storeTerms(false).catch((e) => console.error(e))
            )
        }
    }

    // Handlers for auto resizing the textareas, and for Enter / Shift+Enter
    for (const elementName of [SEARCH_TERM_INPUT_ID, REPLACE_TERM_INPUT_ID]) {
        const element = <HTMLTextAreaElement | null>document.getElementById(elementName)
        if (!element) {
            continue
        }
        autoGrow(element)
        element.addEventListener('input', function () {
            autoGrow(this)
        })
        element.addEventListener('keydown', (e) => searchTermKeydownHandler(e, translationFn))
    }

    // Click handler for historyContent element. Will take the search term and replace term from the history item and populate the input fields
    ;(<HTMLDivElement>document.getElementById('historyContent')).addEventListener('click', historyItemClickHandler)

    // Click handler for swapping terms
    ;(<HTMLButtonElement>document.getElementById('swapTerms')).addEventListener('click', function () {
        const searchTerm = getSearchTermElement()
        const replaceTerm = getReplaceTermElement()
        swapTerms(searchTerm, replaceTerm)
        autoGrow(searchTerm)
        autoGrow(replaceTerm)
    })

    // Localize HTML elements
    localizeElements(langData, () => {
        loadContent(ContentType.SearchForm)
    })
})

// function to change the height of the textarea to fit the content
function autoGrow(element: HTMLTextAreaElement) {
    element.style.height = 'auto'
    element.style.height = element.scrollHeight + 'px'
}

// function to load content from HTML file
async function loadContent(contentType: ContentType) {
    const searchReplaceForm = document.getElementById('searchReplaceForm')
    const settingSection = document.getElementById('settingSection')
    const aboutSection = document.getElementById('aboutSection')
    const historySection = document.getElementById('historySection')
    const replaceNext = document.getElementById('replaceNext')
    const replaceAll = document.getElementById('replaceAll')
    const historyBtn = document.getElementById('history')
    const aboutBtn = document.getElementById('about')
    const settingBtn = document.getElementById('setting')
    // The footer holds nothing but the two action buttons, so it would otherwise sit there as an
    // empty grey band on the Settings, About and History sections
    const footer = document.getElementById('footer')

    if (contentType === ContentType.SearchForm) {
        showElement(footer)
    } else {
        hideElement(footer)
    }

    switch (contentType) {
        case ContentType.Setting: // pressed setting icon
            hideElement(replaceNext)
            hideElement(replaceAll)
            showElement(settingSection)
            hideElement(searchReplaceForm)
            hideElement(aboutSection)
            hideElement(historySection)
            // Add color in setting button
            inactiveButton(historyBtn)
            inactiveButton(aboutBtn)
            activeButton(settingBtn)
            await loadLanguageOptions()
            break
        case ContentType.About: // pressed about icon
            hideElement(replaceNext)
            hideElement(replaceAll)
            showElement(aboutSection)
            hideElement(searchReplaceForm)
            hideElement(settingSection)
            hideElement(historySection)
            // Add color in about button
            inactiveButton(historyBtn)
            activeButton(aboutBtn)
            inactiveButton(settingBtn)
            break
        case ContentType.History: // pressed history icon
            hideElement(replaceNext)
            hideElement(replaceAll)
            showElement(historySection)
            hideElement(searchReplaceForm)
            hideElement(settingSection)
            hideElement(aboutSection)
            // Add color in history button
            activeButton(historyBtn)
            inactiveButton(aboutBtn)
            inactiveButton(settingBtn)
            break
        case ContentType.SearchForm: // default
            showElement(replaceNext)
            showElement(replaceAll)
            hideElement(settingSection)
            showElement(searchReplaceForm)
            hideElement(historySection)
            hideElement(aboutSection)
            // Remove color of button
            inactiveButton(historyBtn)
            inactiveButton(aboutBtn)
            inactiveButton(settingBtn)
            break
    }
}

function showElement(element: Element | null) {
    if (element) {
        element.classList.add('d-block')
        element.classList.remove('d-none')
    }
}

function hideElement(element: Element | null) {
    if (element) {
        element.classList.remove('d-block')
        element.classList.add('d-none')
    }
}

function activeButton(element: Element | null) {
    if (element) {
        element.classList.add('icon-selected')
    }
}

function inactiveButton(element: Element | null) {
    if (element) {
        element.classList.remove('icon-selected')
    }
}

async function loadLanguageOptions() {
    const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement
    if (!languageSelect) return

    const languages = await getAvailableLanguages()
    languages.sort((a, b) => a.languageName.localeCompare(b.languageName))

    languageSelect.innerHTML = '' // Clear existing options

    languages.forEach((option) => {
        const optionElement = document.createElement('option')
        optionElement.value = option.languageCode
        optionElement.textContent = option.languageName
        languageSelect.appendChild(optionElement)
    })

    // Load the preferred language from storage and select the corresponding option
    chrome.storage.sync.get({ preferredLanguage: 'en' }, (result) => {
        languageSelect.value = result.preferredLanguage
    })

    // Add an event listener for language selection changes
    languageSelect.addEventListener('change', function () {
        const selectedLanguage = this.value
        chrome.storage.sync.set({ preferredLanguage: selectedLanguage })
    })
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
export function historyItemClickHandler(e: Event) {
    const target = <HTMLElement>e.target

    if (target.tagName === 'LI') {
        const options = CHECKBOXES.reduce<SearchReplaceOptions>((result, checkboxName) => {
            result[checkboxName] = target.getAttribute(`data-${checkboxName}`) === 'true'
            return result
        }, {} as SearchReplaceOptions)

        const searchReplaceInstance: SearchReplaceInstance = {
            searchTerm: target.getAttribute('data-searchTerm') || '',
            replaceTerm: target.getAttribute('data-replaceTerm') || '',
            options,
        }
        restoreSearchReplaceInstance(searchReplaceInstance)
        storeTerms(false).catch((error) => console.error(error))
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
    callbackHandler: (msg: SearchReplaceResponse, translationFn: TranslationProxy) => void,
    replaceAll: boolean
) {
    const loader = document.getElementById('loader')
    if (loader) loader.style.display = 'block'
    const githubVersion = document.getElementById('github_version')
    if (githubVersion) githubVersion.style.display = 'block'
    const content = document.getElementById('content')
    if (content) content.style.display = 'none'
    const searchReplaceInstance = getInputValues(replaceAll)
    const historyItems = constructSearchReplaceHistory(searchReplaceInstance)
    // create the new history list items
    createHistoryListItemElements(historyItems)
    // store the new history list items
    await storeTerms(true)
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
    await chrome.runtime.sendMessage({ action: 'clearSavedResponses', instance: searchReplaceInstance })
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
        loadContent(ContentType.SearchForm)
        setCount(msg.result, translationFn)
        setHints(msg.hints)
    }
}

function setCount(result: SearchReplaceResult, translationFn: TranslationProxy) {
    if (getSearchTermElement().value.length >= MIN_SEARCH_TERM_LENGTH) {
        ;(<HTMLDivElement>document.getElementById('searchTermCount')).innerHTML = `${getRemainingMatchCount(
            result
        )} ${translationFn('matches')}`
    } else {
        ;(<HTMLDivElement>document.getElementById('searchTermCount')).innerHTML = ''
    }
}

function setHints(hints?: Hint[]) {
    const hintsElement = document.getElementById('hints')
    if (hintsElement) {
        hintsElement.innerHTML = ''
        if (hints) {
            for (const hint of hints) {
                // check that this hint has not been previously dismissed by reading the local storage

                const hintElement = document.createElement('div')
                hintElement.innerText = hint.hint
                hintElement.setAttribute('role', 'alert')
                const dismissButton = document.createElement('button')
                dismissButton.className = 'btn-close'
                dismissButton.setAttribute('data-bs-dismiss', 'alert')
                dismissButton.setAttribute('aria-label', 'Close')
                dismissButton.setAttribute('type', 'button')
                hintElement.appendChild(dismissButton)
                dismissButton.onclick = function () {
                    const searchReplaceInput = getInputValues(false)
                    const history = constructSearchReplaceHistory()
                    const hintPreferences: HintPreferences = { [hint.name]: true }
                    sendToStorage(searchReplaceInput, history, hintPreferences)
                }
                hintElement.className = 'hint alert alert-info alert-dismissible'
                hintsElement.appendChild(hintElement)
            }
        }
    }
}

function removeLoader() {
    const loader = document.getElementById('loader')
    if (loader) loader.style.display = 'none'
    const githubVersion = document.getElementById('github_version')
    if (githubVersion) githubVersion.style.display = 'none'
    const content = document.getElementById('content')
    if (content) content.style.display = 'block'
}

/** Stores the terms from the popup and performs a count of the terms on the page **/
async function storeTerms(save?: boolean, ignoreLength?: boolean) {
    const searchReplaceInput = getInputValues(false)
    const history = constructSearchReplaceHistory()

    if (searchReplaceInput.searchTerm.length >= MIN_SEARCH_TERM_LENGTH || ignoreLength) {
        // This counts the terms on the page
        const url = await contentScriptCall('count', searchReplaceInput, history)
        // This sends the search replace terms to the background page and stores them
        sendToStorage(searchReplaceInput, history, {}, url, save)
    }
}

/**
 * Enter runs the replacement; Shift+Enter inserts a new line so that multi-line terms can be
 * typed at all.
 *
 * This has to run on keydown so the newline can be suppressed. It used to be handled on keyup,
 * which fired *after* the browser had already inserted the newline — so pressing Enter both
 * added a line break and kicked off a replacement with a half-typed term. See issue #28.
 */
function searchTermKeydownHandler(event: KeyboardEvent, translationFn: TranslationProxy) {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return
    }
    event.preventDefault()
    formSubmitHandler('searchReplace', translationFn, contentScriptCallback, false)
}

function sendToStorage(
    searchReplaceInstance: SearchReplaceInstance,
    history: SearchReplaceInstance[],
    hintPreferences?: HintPreferences,
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
            hintPreferences,
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

function swapTerms(source: HTMLTextAreaElement, target: HTMLTextAreaElement) {
    const sourceText = source.value
    source.value = target.value
    target.value = sourceText
    storeTerms(true, true).catch((error) => console.error(error))
}

function getInputValues(replaceAll: boolean): SearchReplaceInstance {
    const searchTerm = getSearchTermElement().value || ''
    const replaceTerm = getReplaceTermElement().value || ''
    const matchCase = (<HTMLInputElement>document.getElementById('matchCase')).checked
    const inputFieldsOnly = (<HTMLInputElement>document.getElementById('inputFieldsOnly')).checked
    const hiddenContent = (<HTMLInputElement>document.getElementById('hiddenContent')).checked
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
            hiddenContent,
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
