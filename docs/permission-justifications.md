# Chrome Web Store permission justifications — Search and Replace 2.4.0

## tabs

The extension lets a user save a search-and-replace rule and have it reapplied automatically on
later visits to the same page. To do that it must read the URL of the active tab, which is a
privileged tab property and so requires the "tabs" permission.

It is used in exactly three places:

- When a rule is saved, the current tab's URL is read so the rule can be stored against it
  (`src/popup.ts`, `getInstanceId(..., url: tab.url)`).
- On each page load, the active tab's URL is read and matched against the saved rules, so the
  right rule — if any — is applied (`src/background/saved.ts`, `matchSavedInstances`).
- On install or update, tabs are queried by URL pattern so the content script can be injected
  into pages that are already open (`src/background/install.ts`).

URLs are compared against the user's own saved rules and stored only as part of a rule the user
explicitly chose to save. They are held in local extension storage, are never transmitted
anywhere, and no browsing history is read or retained.

## scripting

Chrome only injects a content script into pages loaded after an extension is installed or
updated. Without this permission, every tab a user already had open would do nothing until
manually reloaded, which was a frequent complaint (issue #102).

On install and on update the extension injects its single content script, `searchreplace.js`,
into the tabs that are already open, so it works immediately (`src/background/install.ts`,
`injectContentScriptIntoOpenTabs`).

The injection is limited to that one bundled file — never remote or generated code — and only
into the http, https and file URLs already covered by the extension's host permissions.

## host permissions (http://*/*, https://*/*, file:///*)

Searching and replacing text requires reading and modifying the content of whichever page the
user is working on, and the user chooses that page rather than the extension. All work happens
locally in the page; no page content is sent off the device.

## Single purpose

Find text on the page the user is viewing and replace it with different text, including in form
fields and rich-text editors.

## Remote code

No. All code is bundled in the package. The extension executes no remote or dynamically
generated code.
