import { GMAIL_APPLICATION_NAME, GOOGLE_MAIL_DOMAIN, HINTS, WORDPRESS_ADMIN_CLASS } from './constants'
import { inIframe } from './util'

export function getHints(document: Document): string[] {
    const hints: string[] = []
    if (document.querySelector(`.${WORDPRESS_ADMIN_CLASS}`)) {
        if (document.body.className.indexOf('version-6') > -1) {
            hints.push(HINTS.wordpress6)
        }
    }
    // check if meta tag application-name is Gmail
    if (!inIframe()) {
        const meta = document.querySelector(`meta[content=${GMAIL_APPLICATION_NAME}]`)
        if (window.location.href.indexOf(GOOGLE_MAIL_DOMAIN) > -1) {
            hints.push(HINTS.gmail)
        }
    }
    return hints
}
