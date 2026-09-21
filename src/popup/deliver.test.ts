import { ChromeMock, installChromeMock } from '../testing/chromeMock'
import { SearchReplaceContentMessage } from '../types'
import { beforeEach, describe, expect, test } from 'vitest'
import { deliverToContentScript, isMissingContentScript } from './deliver'

const TAB_ID = 7

function message(): SearchReplaceContentMessage {
    return {
        action: 'searchReplace',
        instance: {
            searchTerm: 'find',
            replaceTerm: 'replace',
            options: {
                matchCase: false,
                inputFieldsOnly: false,
                hiddenContent: false,
                wholeWord: false,
                isRegex: false,
                replaceHTML: false,
                replaceAll: true,
                save: false,
            },
        },
    }
}

let mock: ChromeMock

beforeEach(() => {
    mock = installChromeMock()
})

describe('isMissingContentScript', () => {
    test('recognises the error Chrome raises when nothing is listening', () => {
        // The wording the reporter of issue #126 saw in the extension's error log
        expect(isMissingContentScript(new Error('Could not establish connection. Receiving end does not exist.'))).toBe(
            true
        )
    })

    test('does not swallow unrelated errors', () => {
        expect(isMissingContentScript(new Error('The tab was closed'))).toBe(false)
        expect(isMissingContentScript(new Error('Extension context invalidated'))).toBe(false)
    })

    test('copes with something thrown that is not an Error', () => {
        expect(isMissingContentScript('Receiving end does not exist')).toBe(true)
        expect(isMissingContentScript(undefined)).toBe(false)
    })
})

describe('deliverToContentScript', () => {
    test('sends straight through when the content script is present', async () => {
        expect(await deliverToContentScript(TAB_ID, message())).toBe('delivered')
        expect(mock.sentTabMessages).toHaveLength(1)
        // No need to inject when the page already has it
        expect(mock.executedScripts).toEqual([])
    })

    test('injects the content script and retries when nothing is listening', async () => {
        mock.tabsWithoutContentScript.add(TAB_ID)

        expect(await deliverToContentScript(TAB_ID, message())).toBe('delivered-after-injecting')
        expect(mock.executedScripts).toEqual([{ tabId: TAB_ID, files: ['searchreplace.js'] }])
        // The first attempt failed, the second succeeded
        expect(mock.sentTabMessages).toHaveLength(1)
    })

    test('reports no content script when the page cannot be injected into', async () => {
        // chrome://, the Web Store, a PDF viewer, or file:// without file access
        mock.tabsWithoutContentScript.add(TAB_ID)
        mock.blockedTabIds.add(TAB_ID)

        expect(await deliverToContentScript(TAB_ID, message())).toBe('no-content-script')
        expect(mock.sentTabMessages).toEqual([])
    })

    test('does not reject when the page cannot be reached, so the popup stays usable', async () => {
        mock.tabsWithoutContentScript.add(TAB_ID)
        mock.blockedTabIds.add(TAB_ID)

        await expect(deliverToContentScript(TAB_ID, message())).resolves.toBe('no-content-script')
    })

    test('reports no content script when injection succeeds but the retry still fails', async () => {
        // The tab navigated away between injecting and sending
        mock.tabsWithoutContentScript.add(TAB_ID)
        mock.injectionDoesNotHelp.add(TAB_ID)

        expect(await deliverToContentScript(TAB_ID, message())).toBe('no-content-script')
        expect(mock.executedScripts).toHaveLength(1)
    })

    test('passes other errors on rather than hiding them behind an injection', async () => {
        mock.tabMessageError = new Error('Extension context invalidated')

        await expect(deliverToContentScript(TAB_ID, message())).rejects.toThrow('Extension context invalidated')
        expect(mock.executedScripts).toEqual([])
    })

    test('delivers the message unchanged', async () => {
        mock.tabsWithoutContentScript.add(TAB_ID)
        const msg = message()

        await deliverToContentScript(TAB_ID, msg)

        expect(mock.sentTabMessages[0]).toEqual({ tabId: TAB_ID, message: msg })
    })
})
