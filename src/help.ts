import { getTranslation, localizeElements, manifest } from './util'

window.addEventListener('DOMContentLoaded', async function () {
    const langData = await getTranslation()

    // Localize HTML elements
    localizeElements(langData)

    const versionNumber = document.getElementById('version_number')
    if (versionNumber) {
        versionNumber.textContent = manifest.version
    }

    highlightCurrentSection()
})

/**
 * Marks the contents entry for whichever section is currently on screen. Without it the sidebar
 * gives no indication of where you are in a page this long.
 */
function highlightCurrentSection() {
    const links = new Map<string, HTMLAnchorElement>()
    for (const link of document.querySelectorAll<HTMLAnchorElement>('.toc__list a[href^="#"]')) {
        links.set(link.getAttribute('href')!.slice(1), link)
    }

    const sections = [...links.keys()]
        .map((id) => document.getElementById(id))
        .filter((section): section is HTMLElement => section !== null)

    if (sections.length === 0 || !('IntersectionObserver' in window)) {
        return
    }

    // Tracked as a set rather than "the last one to fire" because sections leave the viewport in
    // an order that depends on scroll direction
    const onScreen = new Set<string>()

    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    onScreen.add(entry.target.id)
                } else {
                    onScreen.delete(entry.target.id)
                }
            }

            const current = sections.find((section) => onScreen.has(section.id))
            for (const [id, link] of links) {
                link.classList.toggle('is-current', current?.id === id)
            }
        },
        // Ignores the band beneath the sticky header, so the highlighted entry is the section you
        // are actually reading rather than the one scrolling out of sight behind it
        { rootMargin: '-72px 0px -55% 0px' }
    )

    for (const section of sections) {
        observer.observe(section)
    }
}
