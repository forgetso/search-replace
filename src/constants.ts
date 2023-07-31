import { RichTextEditor, SelectorType } from './types'

export const ELEMENT_FILTER = new RegExp('(HTML|HEAD|SCRIPT|BODY|STYLE|IFRAME)')
export const INPUT_TEXTAREA_FILTER = new RegExp('(INPUT|TEXTAREA)')
export const GMAIL_APPLICATION_NAME = 'Gmail'
export const GOOGLE_MAIL_DOMAIN = 'mail.google.com'
export const WORDPRESS_ADMIN_CLASS = 'wp-admin'
export const RICH_TEXT_EDITOR_TINY_MCE: RichTextEditor = {
    editor: { type: SelectorType.id, value: '#tinymce', iframe: false },
    container: { type: SelectorType.class, value: '.mce-edit-area', iframe: true },
}
export const RICH_TEXT_EDITOR_GENERIC: RichTextEditor = {
    editor: { type: SelectorType.attribute, value: '[role="textbox"]', iframe: false },
}
export const RICH_TEXT_EDITORS: RichTextEditor[] = [RICH_TEXT_EDITOR_TINY_MCE, RICH_TEXT_EDITOR_GENERIC]

export const HINTS = {
    wordpress6: 'Hint: WordPress 6+ detected. Check "Only change visible content?" when editing posts.',
    gmail: 'Hint: Gmail detected. Check "Only change visible content?" when editing draft emails.',
}
