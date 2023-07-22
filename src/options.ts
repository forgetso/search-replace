import { tabConnect } from './popup'
import { SavedSearchReplaceInstance, SearchReplaceInstance } from './types'

window.addEventListener('DOMContentLoaded', function () {
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
        const saved: SavedSearchReplaceInstance[] = msg.saved || []
        if (saved.length > 0) {
            // create a list of the saved search replace instances
            const savedList = document.getElementById('saved_list')
            if (savedList) {
                savedList.innerHTML = ''
                for (const savedInstance of saved) {
                    const li = document.createElement('li')
                    li.innerHTML = `<span class="saved_item">${savedInstance.searchTerm} => ${savedInstance.replaceTerm}</span>`
                    savedList.appendChild(li)
                }
            }
        }
    })
})

export {}
