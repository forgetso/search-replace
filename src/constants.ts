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
