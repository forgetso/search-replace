// Merges translated messages into a locale file and reorders it to match _locales/en.
//
// Reads a JSON document on stdin of the shape:
//   { "de": { "key": "translated message", ... }, "es": { ... } }
//
// Keys keep the `description` from the English file, so the locale files stay comparable, and
// the output is ordered exactly like English to make diffing a translation against the source
// straightforward.
//
// Usage: node scripts/merge-locale.mjs < translations.json
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function readStdin() {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    return Buffer.concat(chunks).toString('utf8')
}

const translations = JSON.parse(await readStdin())
const english = JSON.parse(await readFile(resolve(root, '_locales/en/messages.json'), 'utf8'))

for (const [locale, messages] of Object.entries(translations)) {
    const path = resolve(root, `_locales/${locale}/messages.json`)
    const existing = JSON.parse(await readFile(path, 'utf8'))

    for (const [key, message] of Object.entries(messages)) {
        if (!(key in english)) {
            throw new Error(`${locale}: "${key}" is not a key in _locales/en/messages.json`)
        }
        existing[key] = { message, description: english[key].description ?? '' }
    }

    const ordered = {}
    for (const key of Object.keys(english)) {
        if (key in existing) ordered[key] = existing[key]
    }
    // Anything the locale has that English no longer does would only ever be dead weight
    const dropped = Object.keys(existing).filter((key) => !(key in english))

    await writeFile(path, `${JSON.stringify(ordered, null, 4)}\n`)
    console.log(
        `${locale}: ${Object.keys(messages).length} merged, ${Object.keys(ordered).length}/${
            Object.keys(english).length
        } translated` + (dropped.length ? `, dropped ${dropped.join(', ')}` : '')
    )
}
