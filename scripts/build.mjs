// Builds the extension with vite.
//
// Each entry point is bundled separately: see the comment in vite.config.mts for why a single
// multi-entry build cannot work for a manifest v3 extension.
//
// Usage:
//   node scripts/build.mjs            production build
//   node scripts/build.mjs --dev      development build (unminified, inline source maps)
//   node scripts/build.mjs --dev --watch
import { build } from 'vite'
import { cp, mkdir, rm, watch as watchFs } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'dist')

// Must stay in step with manifest.json and the extension's HTML pages:
//   background   -> background.service_worker
//   searchreplace -> content_scripts[].js
//   popup        -> assets/popup.html
//   options      -> assets/saveRules.html
//   help         -> assets/help.html
// util.ts and elements.ts are libraries the above import; they are not entry points.
const ENTRIES = ['background', 'searchreplace', 'popup', 'options', 'help']

// source -> destination, relative to the repo root and dist respectively
const STATIC_FILES = [
    ['manifest.json', 'manifest.json'],
    ['assets', 'assets'],
    ['_locales', '_locales'],
]

const isDev = process.argv.includes('--dev')
const isWatch = process.argv.includes('--watch')
const mode = isDev ? 'development' : 'production'

async function copyStaticFiles() {
    await mkdir(outDir, { recursive: true })
    for (const [from, to] of STATIC_FILES) {
        await cp(resolve(root, from), resolve(outDir, to), { recursive: true })
    }
}

async function buildEntry(entry) {
    // vite.config.mts reads this to decide which entry it is building
    process.env.EXTENSION_ENTRY = entry
    await build({
        root,
        mode,
        configFile: resolve(root, 'vite.config.mts'),
        logLevel: 'warn',
        build: isWatch ? { watch: {} } : {},
    })
}

async function main() {
    if (!isWatch) {
        await rm(outDir, { recursive: true, force: true })
    }
    await copyStaticFiles()

    for (const entry of ENTRIES) {
        await buildEntry(entry)
        console.log(`built ${entry}.js`)
    }

    if (isWatch) {
        console.log('watching for changes...')
        // The vite watchers above only cover the TypeScript sources; the manifest, assets and
        // locale files are plain copies, so they need watching separately
        await Promise.all(STATIC_FILES.map(([from]) => watchStatic(from)))
    }
}

async function watchStatic(path) {
    try {
        // eslint-disable-next-line no-unused-vars
        for await (const event of watchFs(resolve(root, path), { recursive: true })) {
            await copyStaticFiles()
            console.log(`copied ${path}`)
        }
    } catch (error) {
        console.warn(`Stopped watching ${path}:`, error.message)
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
