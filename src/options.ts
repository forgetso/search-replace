import {
    SavedInstances,
    SavedSearchReplaceInstance,
    SearchReplaceBackgroundActions,
    SearchReplaceBackgroundMessage,
    SearchReplaceCheckboxNames,
    SearchReplaceInstance,
    SearchReplaceOptions,
    SearchReplacePopupStorage,
} from './types'
import {
    createTranslationProxy,
    getAvailableLanguages,
    getTranslation,
    manifest,
    localizeElements,
    tabConnect,
} from './util'

window.addEventListener('DOMContentLoaded', async function () {
    const languages = await getAvailableLanguages()
    const langData = await getTranslation()
    const getString = createTranslationProxy(langData)

    // Add poller to refresh the page if storage changes detected
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        console.log('changes', changes)
        console.log('namespace', namespace)
        if (namespace === 'local') {
            port.postMessage({ action: 'recover' })
        }
    })

    // Get the stored values from the background page
    const port = tabConnect()
    port.postMessage({ action: 'recover' })

    const aboutContainer = document.getElementById('aboutSection')
    if (aboutContainer) {
        aboutContainer.innerHTML = `
        <div>
        <p class="h5">${getString('ext_name')} <code>${manifest.version}</code></p>
        <p>${getString('ext_description')}</p>
        </div>
        `
    }

    const savedInstancesContainer = document.getElementById('savedInstances')

    // Restore the SavedInstances from storage
    port.onMessage.addListener(function (storageItems: SearchReplacePopupStorage) {
        console.log('storage msg received: ', storageItems)
        console.log('storage msg received storageItems.saved: ', storageItems.storage.saved)
        const saved: SavedInstances = storageItems.storage.saved || ({} as SavedInstances)
        const languageProxy = createTranslationProxy(langData)
        if (Object.keys(saved).length > 0) {
            // create a list of the saved search replace instances

            if (savedInstancesContainer) {
                savedInstancesContainer.innerHTML = instancesToHTML(saved, languageProxy)
                addFormSubmitListeners()
            }
        } else {
            if (savedInstancesContainer) {
                savedInstancesContainer.innerHTML = `<p>${languageProxy('no_saved_instances')}</p>`
            }
        }
    })

    // Localize HTML elements
    localizeElements(langData, () => {})
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
    const action = event.target.name as SearchReplaceBackgroundActions
    const form = getParentForm(event.target)
    if (form) {
        const url = form.elements['url'].value as string
        const searchTerm = form.elements['searchTerm'].value as string
        const replaceTerm = form.elements['replaceTerm'].value as string
        const instanceId = Number(form.elements['instanceId'].value)
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
            action: action,
            // TODO make history optional?
            storage: { instance, history: [] },
            instanceId,
            url,
        } as SearchReplaceBackgroundMessage)
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
    <div class="col-4 rounded-1 p-3" id="instanceForm${instanceId}">
        <div class="card">
            <div class="card-header fw-bold">
                ${getString('RuleID')}: ${instanceId}
            </div>
            <form class="card-body"> 
                <div class="form-group col">
                    <label for="url" class="fw-bold">${getString('URLPattern')}</label>
                    <input type="text" class="form-control data_field" id="url" value="${instance.url}">
                </div>
                <div class="form-group col">
                    <label for="searchTerm" class="fw-bold">${getString('SearchTerm')}</label>
                    <input type="text" class="form-control rounded-1 data_field" id="searchTerm" value="${
                        instance.searchTerm
                    }">
                </div>
                <div class="form-group col">
                    <label for="replaceTerm" class="fw-bold">${getString('SearchTerm')}</label>
                    <input type="text" class="form-control rounded-1 data_field" id="replaceTerm" value="${
                        instance.replaceTerm
                    }">
                </div>
                <div class="col">${checkBoxesToHTML(instance, i18n)}</div>
                <div class="form-group row">
                    <button name="save" id="save" class="col btn btn-light mb-2 rounded-1 border-1 border-dark-subtle m-2 bg-button" type="submit">${getString(
                        'Save'
                    )}</button>
                    <button name="delete" id="delete" class="col btn btn-danger mb-2 rounded-1 border-1 border-dark-subtle m-2" type="submit">${getString(
                        'Delete'
                    )}</button>
                </div>
                <input type="hidden" name="instanceId" value="${instanceId}">
            </form>
        </div>
    </div>`
}

export {}
