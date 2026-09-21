# Chrome Web Store permission justifications

Paste-ready text for the Developer Dashboard. The dashboard asks for a justification for every
permission requested, not only the new ones. Code references are for our own use — they are not
needed in the field, but they are where to check each claim.

## scripting

> Injects the extension's own bundled content script into tabs that are already open when the
> extension is installed or updated, so the user does not have to reload each page first. No
> remote or generated code is executed.

`src/background/install.ts`, `injectContentScriptIntoOpenTabs`.

> **Note:** the `tabs` permission is deliberately not requested. Tab URLs, needed to match saved
> rules, are available through the host permissions below, so `tabs` would add the "Read your
> browsing history" warning for nothing. The published 2.0.9 build works this way already.

## activeTab

> Lets the user run a find and replace on the page they are currently viewing, when they open the
> extension and ask for it.

## storage

> Stores the user's search terms, recent history, saved rules and chosen language locally.

## notifications

> Shows a single notification after installation explaining that a page open before installing
> needs reloading.

`src/background/install.ts`.

## Host permissions — `http://*/*`, `https://*/*`, `file:///*`

> Finding and replacing text requires reading and changing the content of whichever page the user
> is working on. The user chooses that page; nothing is read in the background and no page content
> leaves the device.

## Single purpose

> Find text on the page the user is viewing and replace it with different text, including in form
> fields and rich-text editors.

## Remote code

> No. All code is bundled in the package.
