import { createTranslationProxy, getTranslation, localizeElements } from './util'

window.addEventListener('DOMContentLoaded', async function () {
    const langData = await getTranslation()
    const getString = createTranslationProxy(langData)

    // Localize HTML elements
    localizeElements(langData)
})
