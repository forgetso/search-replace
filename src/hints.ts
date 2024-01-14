import { GMAIL_APPLICATION_NAME, GOOGLE_MAIL_DOMAIN, HINTS } from './constants'
import { inIframe } from './util'

export function getHints(document: Document): string[] {
    const hints: string[] = []
    // check if meta tag application-name is Gmail
    if (!inIframe()) {
        const meta = document.querySelector(`meta[content=${GMAIL_APPLICATION_NAME}]`)
        if (window.location.href.indexOf(GOOGLE_MAIL_DOMAIN) > -1 || meta) {
            hints.push(HINTS.gmail)
        }
    }
    return hints
}
