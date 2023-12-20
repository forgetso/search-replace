import { RichTextEditor, SelectorType } from './types'

export const ELEMENT_FILTER = /(HTML|HEAD|SCRIPT|BODY|STYLE|IFRAME)/
export const INPUT_TEXTAREA_FILTER = /(INPUT|TEXTAREA)/
export const GMAIL_APPLICATION_NAME = 'Gmail'
export const GOOGLE_MAIL_DOMAIN = 'mail.google.com'
export const WORDPRESS_ADMIN_CLASS = 'wp-admin'
export const WORDPRESS_VERSION_6_SELECTOR = 'body[class*=version-6]'
export const RICH_TEXT_EDITOR_TINY_MCE: RichTextEditor = {
    editor: { type: SelectorType.id, value: ['#tinymce'], iframe: false },
    container: { type: SelectorType.class, value: ['.mce-edit-area'], iframe: true },
}
export const RICH_TEXT_EDITOR_GUTENBERG_DOCUMENT: RichTextEditor = {
    container: { type: SelectorType.attribute, value: ['[name="editor-canvas"]'], iframe: true },
    editor: { type: SelectorType.attribute, value: ['[role="document"]', '[role="textbox"]'], iframe: false },
}
export const RICH_TEXT_EDITORS: RichTextEditor[] = [RICH_TEXT_EDITOR_TINY_MCE, RICH_TEXT_EDITOR_GUTENBERG_DOCUMENT]

export const HINTS = {
    wordpress6: 'Hint: WordPress 6+ detected. Check "Visible content only?" when editing posts.',
    gmail: 'Hint: Gmail detected. Check "Visible content only?" when editing draft emails.',
}
