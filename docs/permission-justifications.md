# Chrome Web Store permission justifications

Paste-ready text for the Developer Dashboard. The dashboard asks for a justification for every
permission requested, not only the new ones. Code references are for our own use — they are not
needed in the field, but they are where to check each claim.

## tabs

> Reads the URL of the active tab so that saved find-and-replace rules can be matched to the page
> they were saved on and reapplied on later visits. URLs are kept in local extension storage as
> part of the user's own saved rules and are never transmitted.

`src/background/saved.ts` (matching), `src/popup.ts` (saving), `src/background/install.ts` (query).

## scripting

> Injects the extension's own bundled content script into tabs that are already open when the
> extension is installed or updated, so the user does not have to reload each page first. No
> remote or generated code is executed.

`src/background/install.ts`, `injectContentScriptIntoOpenTabs`.

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
