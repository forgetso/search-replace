import {
    createTranslationProxy,
    getAvailableLanguages,
    getTranslation,
    localizeElements,
    manifest,
    recoverMessage,
    tabConnect,
} from './util'
import {
    SavedInstances,
    SavedSearchReplaceInstance,
    SearchReplaceAction,
    SearchReplaceCheckboxNames,
    SearchReplaceInstance,
    SearchReplaceOptions,
    SearchReplaceStorageItems,
    SearchReplaceStorageMessage,
} from './types'

window.addEventListener('DOMContentLoaded', async function () {
    const languages = await getAvailableLanguages()
    const langData = await getTranslation()
    const getString = createTranslationProxy(langData)

    // Add poller to refresh the page if storage changes detected
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        console.log('changes', changes)
        console.log('namespace', namespace)
        if (namespace === 'local') {
            port.postMessage(recoverMessage)
        }
    })

    // Get the stored values from the background page
    const port = tabConnect()
    port.postMessage(recoverMessage)

    const settingsContainer = document.getElementById('settingsSection') as HTMLSelectElement
    if (settingsContainer) {
        settingsContainer.innerHTML = `
        <label for="languageSelect">${getString('select_language')}</label>
        <select id="languageSelect" class="form-select"></select>
        `
    }

    const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement

    if (settingsContainer && languageSelect) {
        // Populate the select element
        languages.forEach((option) => {
            const optionElement = document.createElement('option')
            optionElement.value = option.languageCode
            optionElement.textContent = option.languageName
            languageSelect.appendChild(optionElement)
        })

        // Load the preferred language from storage and select the corresponding option
        chrome.storage.sync.get({ preferredLanguage: 'en' }, (result) => {
            const selectedLanguage = result.preferredLanguage
            languageSelect.value = selectedLanguage
        })

        // Add an event listener for language selection changes
        languageSelect.addEventListener('change', function () {
            const selectedLanguage = this.value

            chrome.storage.sync.set({ preferredLanguage: selectedLanguage })
        })
    }

    const aboutContainer = document.getElementById('aboutSection')
    if (aboutContainer) {
        aboutContainer.innerHTML = `
        <div>
        <p class="h5">${getString('ext_name')} <code>v${manifest.version}</code></p>
        <p>${getString('ext_description')}</p>
        </div>
        `
    }

    const savedInstancesContainer = document.getElementById('savedInstances')

    // Restore the SavedInstances from storage
    port.onMessage.addListener(function (storageItems: SearchReplaceStorageItems) {
        console.log('storage msg received: ', storageItems)
        const saved: SavedInstances = storageItems.saved || ({} as SavedInstances)
        if (Object.keys(saved).length > 0) {
            // create a list of the saved search replace instances

            if (savedInstancesContainer) {
                savedInstancesContainer.innerHTML = instancesToHTML(saved, createTranslationProxy(langData))
                addFormSubmitListeners()
            }
        } else {
            if (savedInstancesContainer) {
                savedInstancesContainer.innerHTML = '<p>No saved instances</p>'
            }
        }
    })

    // Localize HTML elements
    localizeElements(langData)
})

function addFormSubmitListeners() {
    //add event listener to the save button of each saved instance form
    // get each form
    const forms = <NodeListOf<HTMLFormElement>>document.querySelectorAll('form')
    for (const form of forms) {
        // add submit event listener to all buttons in the form
        Array.from(form.getElementsByTagName('button')).map((el) =>
            el.addEventListener('click', savedInstanceSubmitHandler)
        )
    }
}

//get parent form
function getParentForm(el: HTMLElement) {
    while (el && el.nodeName !== 'FORM') {
        el = el.parentNode as HTMLElement
    }
    return el as HTMLFormElement
}

function savedInstanceSubmitHandler(event) {
    event.preventDefault()
    const action = event.target.name as SearchReplaceAction
    const form = getParentForm(event.target)
    if (form) {
        const url = form.elements['url'].value as string
        const searchTerm = form.elements['searchTerm'].value as string
        const replaceTerm = form.elements['replaceTerm'].value as string
        const instanceId = form.elements['instanceId'].value as string
        const options: Partial<SearchReplaceOptions> = { save: true }
        for (const name of getCheckboxNames()) {
            options[name] = form.elements[name].checked === true
        }
        const instance: SearchReplaceInstance = {
            searchTerm,
            replaceTerm,
            options: options as SearchReplaceOptions,
        }
        const port = tabConnect()
        port.postMessage({
            actions: { [action]: true } as { [key in SearchReplaceAction]: boolean },
            // TODO make history optional?
            storage: { instance, history: [] },
            instanceId,
            url,
        } as SearchReplaceStorageMessage)
    }
}

function instancesToHTML(instances: SavedInstances, i18n) {
    return Object.entries(instances)
        .map(([instanceId, instance]) => instanceToHTML(instance, instanceId, i18n))
        .join('')
}

function checkBoxesToHTML(instance, i18n) {
    const getString = i18n

    const checkboxes = getCheckboxNames().map((name) => {
        const checked = instance.options[name] ? 'checked' : ''
        return `
                <div class="form-check">
                    <label for="${name}" class="form-check-label">${getString(name)}</label>
                    <input name="${name}" type="checkbox" class="form-check-input data_field" id="${name}" ${checked}>
                </div>`
    })
    return checkboxes.join('')
}

function getCheckboxNames() {
    return Object.values(SearchReplaceCheckboxNames).filter((name) => name !== SearchReplaceCheckboxNames.save)
}

function instanceToHTML(instance: SavedSearchReplaceInstance, instanceId: string, i18n) {
    const getString = i18n

    return `
    <div class="row align-items-start rounded-1 mb-2 card" id="instanceForm${instanceId}">
            <div class="card-header">
                ${getString('RuleID')}: ${instanceId}
            </div>
            <form class="card-body"> 
                <div class="form-group col">
                    <label for="url">${getString('URLPattern')}</label>
                    <input type="text" class="form-control data_field" id="url" value="${instance.url}">
                </div>
                <div class="form-group col">
                    <label for="searchTerm">${getString('SearchTerm')}</label>
                    <input type="text" class="form-control rounded-1 data_field" id="searchTerm" value="${
                        instance.searchTerm
                    }">
                </div>
                <div class="form-group col">
                    <label for="replaceTerm">${getString('SearchTerm')}</label>
                    <input type="text" class="form-control rounded-1 data_field" id="replaceTerm" value="${
                        instance.replaceTerm
                    }">
                </div>
                <div class="col">${checkBoxesToHTML(instance, i18n)}</div>
                <div class="form-group row">
                    <button name="save" id="save" class="col btn btn-light mb-2 rounded-1 border-1 border-dark-subtle m-2" type="submit">${getString(
                        'Save'
                    )}</button>
                    <button name="delete" id="delete" class="col btn btn-danger mb-2 rounded-1 border-1 border-dark-subtle m-2" type="submit">${getString(
                        'Delete'
                    )}</button>
                </div>
                <input type="hidden" name="instanceId" value="${instanceId}">
            </form>
    </div>`
}

export {}
