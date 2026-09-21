import {
    SavedInstances,
    SavedSearchReplaceInstance,
    SearchReplaceBackgroundActions,
    SearchReplaceBackgroundMessage,
    SearchReplaceCheckboxNames,
    SearchReplaceInstance,
    SearchReplaceOptions,
    SearchReplacePopupStorage,
    TranslationProxy,
} from './types'
import { createTranslationProxy, getTranslation, localizeElements, manifest, tabConnect } from './util'

window.addEventListener('DOMContentLoaded', async function () {
    const langData = await getTranslation()
    const languageProxy = createTranslationProxy(langData)

    // Add poller to refresh the page if storage changes detected
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        if (namespace === 'local') {
            port.postMessage({ action: 'recover' })
        }
    })

    // Get the stored values from the background page
    const port = tabConnect()
    port.postMessage({ action: 'recover' })

    const versionNumber = document.getElementById('version_number')
    if (versionNumber) {
        versionNumber.textContent = manifest.version
    }

    const savedInstancesContainer = document.getElementById('savedInstances')

    // Restore the SavedInstances from storage
    port.onMessage.addListener(function (storageItems: SearchReplacePopupStorage) {
        const saved: SavedInstances = storageItems.storage.saved || ({} as SavedInstances)
        if (!savedInstancesContainer) {
            return
        }
        if (Object.keys(saved).length > 0) {
            // create a list of the saved search replace instances
            savedInstancesContainer.innerHTML = `<ul class="rule-grid">${instancesToHTML(saved, languageProxy)}</ul>`
            addFormSubmitListeners()
            autoGrowFields(savedInstancesContainer)
        } else {
            savedInstancesContainer.innerHTML = `
                <div class="empty-state">
                    <p>${languageProxy('no_saved_instances')}</p>
                    <p>${languageProxy('no_saved_instances_hint')}</p>
                </div>`
        }
    })

    // Localize HTML elements
    localizeElements(langData)
})

/** Sizes each field to its content, and keeps it sized as the value is edited */
function autoGrowFields(container: HTMLElement) {
    for (const field of container.querySelectorAll('textarea')) {
        const grow = () => {
            field.style.height = 'auto'
            field.style.height = `${field.scrollHeight}px`
        }
        grow()
        field.addEventListener('input', grow)
        // A textarea is used for wrapping, not for multi-line values: a newline in a URL pattern
        // or a search term would be saved along with it and never match anything
        field.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault()
            }
        })
    }
}

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
function getParentForm(el: HTMLElement | null): HTMLFormElement | null {
    let candidate: HTMLElement | null = el
    while (candidate && candidate.nodeName !== 'FORM') {
        candidate = candidate.parentElement
    }
    return candidate as HTMLFormElement | null
}

/** Reads a named field's value without indexing into `form.elements` by string */
function getFieldValue(form: HTMLFormElement, name: string): string {
    const field = form.elements.namedItem(name)
    return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : ''
}

function getFieldChecked(form: HTMLFormElement, name: string): boolean {
    const field = form.elements.namedItem(name)
    return field instanceof HTMLInputElement && field.checked
}

function savedInstanceSubmitHandler(event: Event) {
    event.preventDefault()
    const target = event.target
    if (!(target instanceof HTMLElement)) {
        return
    }
    const action = target.getAttribute('name') as SearchReplaceBackgroundActions
    const form = getParentForm(target)
    if (form) {
        const url = getFieldValue(form, 'url')
        const searchTerm = getFieldValue(form, 'searchTerm')
        const replaceTerm = getFieldValue(form, 'replaceTerm')
        const instanceId = Number(getFieldValue(form, 'instanceId'))
        const options: Partial<SearchReplaceOptions> = { save: true }
        for (const name of getCheckboxNames()) {
            options[name] = getFieldChecked(form, name)
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

function instancesToHTML(instances: SavedInstances, i18n: TranslationProxy) {
    return Object.entries(instances)
        .map(([instanceId, instance]) => instanceToHTML(instance, instanceId, i18n))
        .join('')
}

/**
 * Saved terms are arbitrary user text and end up inside an attribute, so a stray quote would
 * otherwise close the attribute early and swallow the rest of the card.
 */
function escapeHTML(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function checkBoxesToHTML(instance: SavedSearchReplaceInstance, instanceId: string, i18n: TranslationProxy) {
    const getString = i18n

    const checkboxes = getCheckboxNames().map((name) => {
        const checked = instance.options[name] ? 'checked' : ''
        // The ids have to carry the instance id: every rule renders the same set of checkboxes,
        // so a bare `id="matchCase"` would repeat down the page and every label would point at
        // the first card's checkbox
        const id = `${name}-${instanceId}`
        return `
                        <div class="form-check">
                            <input name="${name}" type="checkbox" class="form-check-input data_field" id="${id}" ${checked}>
                            <label for="${id}" class="form-check-label">${getString(name)}</label>
                        </div>`
    })
    return checkboxes.join('')
}

function getCheckboxNames() {
    return Object.values(SearchReplaceCheckboxNames).filter((name) => name !== SearchReplaceCheckboxNames.save)
}

/**
 * A textarea rather than a text input: URL patterns and search terms are routinely longer than
 * the card is wide, and an input can only scroll them out of sight one line at a time. The
 * textarea is grown to fit its content by autoGrowFields() below, so the whole value is visible.
 */
function field(instanceId: string, name: string, label: string, value: string) {
    const id = `${name}-${instanceId}`
    return `
                    <div class="field">
                        <label for="${id}" class="field__label">${label}</label>
                        <textarea name="${name}" id="${id}" rows="1" class="form-control data_field">${escapeHTML(
        value
    )}</textarea>
                    </div>`
}

function instanceToHTML(instance: SavedSearchReplaceInstance, instanceId: string, i18n: TranslationProxy) {
    const getString = i18n

    return `
        <li class="rule-card" id="instanceForm${instanceId}">
            <form>
                <div class="rule-card__head">
                    <span class="rule-card__id">${getString('RuleID')} ${instanceId}</span>
                </div>
                <div class="rule-card__body">
                    ${field(instanceId, 'url', getString('URLPattern'), instance.url)}
                    ${field(instanceId, 'searchTerm', getString('SearchTerm'), instance.searchTerm)}
                    ${field(instanceId, 'replaceTerm', getString('ReplaceTerm'), instance.replaceTerm)}
                    <div class="rule-card__options" role="group" aria-labelledby="options-${instanceId}">
                        <span class="field__label" id="options-${instanceId}">${getString('options')}</span>
                        ${checkBoxesToHTML(instance, instanceId, i18n)}
                    </div>
                </div>
                <div class="rule-card__actions">
                    <button name="delete" class="btn-ghost" type="submit">${getString('Delete')}</button>
                    <button name="save" class="btn-primary" type="submit">${getString('Save')}</button>
                </div>
                <input type="hidden" name="instanceId" value="${escapeHTML(instanceId)}">
            </form>
        </li>`
}

export {}
