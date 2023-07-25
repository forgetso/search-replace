import { tabConnect } from './util'
import {
    SavedInstances,
    SavedSearchReplaceInstance,
    SearchReplaceCheckboxLabels,
    SearchReplaceCheckboxNames,
    SearchReplaceInstance,
    SearchReplaceOptions,
} from './types'

window.addEventListener('DOMContentLoaded', function () {
    // Add poller to refresh the page if storage changes detected
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        console.log('changes', changes)
        console.log('namespace', namespace)
        if (namespace === 'local') {
            port.postMessage({
                recover: true,
            })
        }
    })

    // Get the stored values from the background page
    const port = tabConnect()
    port.postMessage({
        recover: true,
    })

    const savedInstancesContainer = document.getElementById('savedInstances')

    // Restore the SavedInstances from storage
    port.onMessage.addListener(function (msg) {
        const saved: SavedInstances = msg.saved || []
        if (Object.keys(saved).length > 0) {
            // create a list of the saved search replace instances

            if (savedInstancesContainer) {
                savedInstancesContainer.innerHTML = instancesToHTML(saved)
                addFormSubmitListeners()
            }
        } else {
            if (savedInstancesContainer) {
                savedInstancesContainer.innerHTML = '<p>No saved instances</p>'
            }
        }
    })
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
    const action = event.target.name
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
            [action]: true,
            instance,
            instanceId,
            url,
        })
    }
}

function instancesToHTML(instances: SavedInstances) {
    return Object.entries(instances)
        .map(([instanceId, instance]) => instanceToHTML(instance, instanceId))
        .join('')
}

function checkBoxesToHTML(instance) {
    console.log('checkbox names', getCheckboxNames())
    const checkboxes = getCheckboxNames().map((name, index) => {
        const checked = instance.options[name] ? 'checked' : ''
        return `
                <div class="form-check">
                    <label for="${name}" class="form-check-label">${
            Object.values(SearchReplaceCheckboxLabels)[index]
        }</label>
                    <input name="${name}" type="checkbox" class="form-check-input data_field" id="${name}" ${checked}>
                </div>`
    })
    return checkboxes.join('')
}

function getCheckboxNames() {
    return Object.values(SearchReplaceCheckboxNames).filter((name) => name !== SearchReplaceCheckboxNames.save)
}

function instanceToHTML(instance: SavedSearchReplaceInstance, instanceId: string) {
    return `
    <div class="row align-items-start rounded-1 mb-2 card" id="instanceForm${instanceId}">
            <div class="card-header">
                Rule ID: ${instanceId}
            </div>
            <form class="card-body"> 
                <div class="form-group col">
                    <label for="url">URL Pattern</label>
                    <input type="text" class="form-control data_field" id="url" value="${instance.url}">
                </div>
                <div class="form-group col">
                    <label for="searchTerm">Search Term</label>
                    <input type="text" class="form-control rounded-1 data_field" id="searchTerm" value="${
                        instance.searchTerm
                    }">
                </div>
                <div class="form-group col">
                    <label for="replaceTerm">Replace Term</label>
                    <input type="text" class="form-control rounded-1 data_field" id="replaceTerm" value="${
                        instance.replaceTerm
                    }">
                </div>
                <div class="col">${checkBoxesToHTML(instance)}</div>
                <div class="form-group row">
                    <button name="save" id="save" class="col btn btn-light mb-2 rounded-1 border-1 border-dark-subtle m-2" type="submit">Save</button>
                    <button name="delete" id="delete" class="col btn btn-danger mb-2 rounded-1 border-1 border-dark-subtle m-2" type="submit">Delete</button>
                </div>
                <input type="hidden" name="instanceId" value="${instanceId}">
            </form>
    </div>`
}

export {}
