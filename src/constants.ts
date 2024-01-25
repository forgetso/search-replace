import { Hint } from './types'

export const ELEMENT_FILTER = /(HTML|HEAD|SCRIPT|STYLE|IFRAME)/i
export const INPUT_TEXTAREA_FILTER = /(INPUT|TEXTAREA)/
export const HINTS: Record<string, Hint> = {
    gmail: {
        hint: 'Hint: Gmail detected. Check "Visible content only?" when editing draft emails.',
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
