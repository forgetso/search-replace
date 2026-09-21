import { Hint } from './types'
export const RICH_TEXT_EDITORS = {
    class: ['mce-edit-area', 'cke_wysiwyg_frame', 'tinymce', 'wysiwyg'],
    name: ['editor-canvas'],
}
/**
 * Tags whose contents are never searched.
 *
 * Anchored deliberately: an unanchored pattern also matches any tag *containing* one of these
 * names, so `<header>` was treated as `<head>` and excluded from the count on virtually every
 * site, while the replacement still rewrote it. That mismatch is what produced negative
 * "matches remaining" figures in the popup.
 */
export const ELEMENT_FILTER = /^(HTML|HEAD|SCRIPT|STYLE|IFRAME)$/i
export const INPUT_TEXTAREA_CONTENT_EDITABLE_SELECTOR = 'input,textarea,*[contenteditable="true"]'

/** The bundle listed under content_scripts in manifest.json, and injected on demand */
export const CONTENT_SCRIPT_FILE = 'searchreplace.js'

/**
 * Chrome's wording when `tabs.sendMessage` finds nobody listening in the target tab, which
 * happens when the page was loaded before the extension, or when the extension has been
 * reloaded or auto-updated since the page was loaded, orphaning its content script.
 */
export const NO_RECEIVER_MESSAGE = 'Receiving end does not exist'
export const HINTS: Record<string, Hint> = {
    gmail: {
        hint: 'Hint: Gmail detected. Check "Input fields only?" when editing draft emails.',
        domain: 'mail.google.com',
        selector: `meta[content="Gmail"]`,
        name: 'gmail',
    },
    amazon_seller: {
        hint: 'Hint: Amazon Seller Central detected. Check "Hidden content?" and "Input fields only?" when editing listings.',
        domain: 'sellercentral.amazon',
        selector: '*[product="SellOnAmazon"]',
        name: 'amazon_seller',
    },
}
