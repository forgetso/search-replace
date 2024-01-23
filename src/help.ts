import { getTranslation, localizeElements } from './util'

window.addEventListener('DOMContentLoaded', async function () {
    const langData = await getTranslation()

    // Localize HTML elements
    localizeElements(langData)
})
