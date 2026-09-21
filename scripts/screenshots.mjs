// Regenerates the screenshots that assets/help.html embeds.
//
// The popup shots are taken from assets/popup.html itself, so they can never drift from the
// real markup or from style.css the way hand-captured images did: the previous set still
// showed a green-and-white popup that was never shipped.
//
// popup.js is stripped out (it needs the chrome.* APIs) and replaced with a small harness that
// puts the popup into the state each shot is meant to illustrate and names the element to crop
// to, so the images come out as the popup alone with nothing around it.
//
// Usage:
//   npm run screenshots                       regenerate every shot
//   node scripts/screenshots.mjs setup-regex  regenerate the named shots only
import { dirname, resolve } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assets = resolve(root, 'assets')

// The harness files have to sit in assets/ so that the relative hrefs in popup.html (bootstrap,
// style.css, the icons) resolve. They are removed again when the script finishes.
const harnessPath = (name) => resolve(assets, `.screenshot-harness-${name}.html`)

// Every shot is written once per density, for the `srcset` pair in help.html
const DENSITIES = [1, 2]
const POPUP_WIDTH = 320

const CHROME_CANDIDATES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']

/**
 * Popup shots. `count` is the text of the match counter between the two fields; leave it out
 * for the states where the popup has not counted anything yet.
 */
const POPUP_SHOTS = [
    {
        name: 'popup-overview',
        searchTerm: 'Condo',
        replaceTerm: 'apartment',
        count: '4 matches',
        checked: [],
    },
    {
        name: 'setup-input-fields',
        searchTerm: 'Condo',
        replaceTerm: 'apartment',
        count: '2 matches',
        checked: ['inputFieldsOnly'],
    },
    {
        name: 'setup-match-case',
        searchTerm: 'Condo',
        replaceTerm: 'apartment',
        count: '3 matches',
        checked: ['matchCase'],
    },
    {
        name: 'setup-whole-word',
        searchTerm: 'partial',
        replaceTerm: 'complete',
        count: '2 matches',
        checked: ['wholeWord'],
    },
    {
        name: 'setup-hidden-content',
        searchTerm: 'Condo',
        replaceTerm: 'apartment',
        count: '6 matches',
        checked: ['hiddenContent'],
    },
    {
        name: 'setup-regex',
        searchTerm: '1\\d1',
        replaceTerm: '101',
        count: '10 matches',
        checked: ['isRegex'],
    },
    {
        name: 'setup-replace-html',
        searchTerm: 'example.com',
        replaceTerm: 'example.org',
        count: '7 matches',
        checked: ['replaceHTML'],
    },
    {
        name: 'setup-wordpress',
        searchTerm: 'Hello world',
        replaceTerm: 'Something else',
        count: '3 matches',
        checked: [],
    },
    {
        name: 'setup-save-rule',
        searchTerm: 'Condo',
        replaceTerm: 'apartment',
        count: '4 matches',
        checked: ['save'],
    },
]

async function findChrome() {
    for (const candidate of CHROME_CANDIDATES) {
        try {
            await run('which', [candidate])
            return candidate
        } catch {
            // try the next one
        }
    }
    throw new Error(`No Chrome binary found. Tried: ${CHROME_CANDIDATES.join(', ')}`)
}

/**
 * A very small DevTools Protocol client.
 *
 * `--screenshot` on the command line cannot be used here: under `--headless=new` the viewport
 * comes out roughly 87 CSS pixels shorter than the requested `--window-size`, so the popup's
 * footer fell off the bottom of every image while the file itself was the full requested size.
 * Page.captureScreenshot takes an explicit clip rectangle, which crops to the element exactly.
 */
class Browser {
    constructor(proc, socket, profileDir) {
        this.proc = proc
        this.socket = socket
        this.profileDir = profileDir
        this.nextId = 1
        this.pending = new Map()
        this.listeners = new Set()
        socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data)
            if (message.id !== undefined) {
                const { resolve, reject } = this.pending.get(message.id) ?? {}
                this.pending.delete(message.id)
                message.error ? reject?.(new Error(JSON.stringify(message.error))) : resolve?.(message.result)
            } else {
                for (const listener of this.listeners) listener(message)
            }
        })
    }

    static async launch(bin) {
        const profileDir = await mkdtemp(resolve(tmpdir(), 'sr-screenshots-'))
        const proc = spawn(
            bin,
            [
                '--headless=new',
                '--no-sandbox',
                '--disable-gpu',
                '--hide-scrollbars',
                '--disable-lcd-text',
                '--allow-file-access-from-files',
                `--user-data-dir=${profileDir}`,
                '--remote-debugging-port=0',
                'about:blank',
            ],
            { stdio: ['ignore', 'ignore', 'pipe'] }
        )

        const endpoint = await new Promise((resolveEndpoint, rejectEndpoint) => {
            let output = ''
            const timer = setTimeout(() => rejectEndpoint(new Error(`Chrome did not start:\n${output}`)), 30_000)
            proc.stderr.on('data', (chunk) => {
                output += chunk
                const match = output.match(/ws:\/\/\S+/)
                if (match) {
                    clearTimeout(timer)
                    resolveEndpoint(match[0])
                }
            })
            proc.on('exit', (code) => {
                clearTimeout(timer)
                rejectEndpoint(new Error(`Chrome exited with ${code}:\n${output}`))
            })
        })

        const socket = new WebSocket(endpoint)
        await new Promise((ready, failed) => {
            socket.addEventListener('open', ready, { once: true })
            socket.addEventListener('error', () => failed(new Error('Could not connect to Chrome')), { once: true })
        })
        return new Browser(proc, socket, profileDir)
    }

    send(method, params = {}, sessionId) {
        const id = this.nextId++
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
            this.socket.send(JSON.stringify({ id, method, params, sessionId }))
        })
    }

    once(method, sessionId) {
        return new Promise((resolve) => {
            const listener = (message) => {
                if (message.method === method && message.sessionId === sessionId) {
                    this.listeners.delete(listener)
                    resolve(message.params)
                }
            }
            this.listeners.add(listener)
        })
    }

    /**
     * Renders `url` and writes the crop region to `<output>.png` and `<output>@2x.png`.
     *
     * Both densities are needed. A 2x image shown at half size is visibly soft on an ordinary
     * display, and a 1x image is soft on a HiDPI one, so the help page offers the pair through
     * `srcset` and lets the browser take the one that lands on whole pixels.
     */
    async capture(url, { width, output }) {
        const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' })
        const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true })
        try {
            await this.send('Page.enable', {}, sessionId)
            // A tall viewport so that nothing is lazily skipped; the clip below decides the crop
            await this.send(
                'Emulation.setDeviceMetricsOverride',
                { width, height: 2400, deviceScaleFactor: 1, mobile: false },
                sessionId
            )
            const loaded = this.once('Page.loadEventFired', sessionId)
            await this.send('Page.navigate', { url }, sessionId)
            await loaded

            const { result } = await this.send(
                'Runtime.evaluate',
                {
                    expression: `(() => {
                        const selector = document.documentElement.dataset.shotTarget || 'body'
                        const box = document.querySelector(selector).getBoundingClientRect()
                        return JSON.stringify({ width: box.width, height: box.height, x: box.x, y: box.y })
                    })()`,
                    returnByValue: true,
                },
                sessionId
            )
            const box = JSON.parse(result.value)

            const clip = {
                x: Math.round(box.x),
                y: Math.round(box.y),
                width: Math.round(box.width),
                height: Math.ceil(box.height),
            }

            for (const scale of DENSITIES) {
                const { data } = await this.send(
                    'Page.captureScreenshot',
                    { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale } },
                    sessionId
                )
                const path = scale === 1 ? `${output}.png` : `${output}@${scale}x.png`
                await writeFile(path, Buffer.from(data, 'base64'))
                console.log(`  ${path.replace(`${root}/`, '')} (${clip.width * scale}x${clip.height * scale})`)
            }
        } finally {
            await this.send('Target.closeTarget', { targetId })
        }
    }

    async close() {
        this.socket.close()
        // Chrome is still flushing its profile while it shuts down, so removing the directory
        // straight away races it and fails with ENOTEMPTY
        const exited = new Promise((resolve) => this.proc.once('exit', resolve))
        this.proc.kill()
        await exited
        await rm(this.profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
}

async function popupHarness(shot) {
    const popup = await readFile(resolve(assets, 'popup.html'), 'utf8')
    const body = popup
        .replace('<script src="../popup.js"></script>', '')
        // The version link below #content is only shown while the popup is loading
        .replace(/<div class="text-center">[\s\S]*?<\/div>\s*<\/body>/, '</body>')

    const harness = `
    <style>
        html, body { margin: 0; padding: 0; width: ${POPUP_WIDTH}px; overflow: hidden; }
    </style>
    <script>
        document.getElementById('loader').remove()
        // popup.js hides these three panels whenever the search form is the visible section
        for (const id of ['settingSection', 'aboutSection', 'historySection']) {
            document.getElementById(id).classList.add('d-none')
        }
        // The markup ships with the history icon underlined; popup.js clears it on the search form
        document.getElementById('history').classList.remove('icon-selected')

        document.getElementById('searchTerm').value = ${JSON.stringify(shot.searchTerm)}
        document.getElementById('replaceTerm').value = ${JSON.stringify(shot.replaceTerm)}
        for (const id of ${JSON.stringify(shot.checked)}) {
            document.getElementById(id).checked = true
        }
        document.getElementById('searchTermCount').textContent = ${JSON.stringify(shot.count ?? '')}

        // Mirrors autoGrow() in popup.ts
        for (const id of ['searchTerm', 'replaceTerm']) {
            const field = document.getElementById(id)
            field.style.height = 'auto'
            field.style.height = field.scrollHeight + 'px'
        }

        // Crop to the popup itself rather than to the document
        document.documentElement.dataset.shotTarget = '#content'
    </script>
    </body>`

    return body.replace('</body>', harness)
}

/**
 * The saved rules page. The card markup mirrors instanceToHTML() in src/options.ts, which
 * cannot be imported here because it is TypeScript and needs the chrome.* APIs to run.
 */
function rulesHarness() {
    const rule = (id, url, searchTerm, replaceTerm, checked) => `
        <li class="rule-card">
            <form>
                <div class="rule-card__head">
                    <span class="rule-card__id">Rule ${id}</span>
                </div>
                <div class="rule-card__body">
                    <div class="field">
                        <label class="field__label">URL Pattern</label>
                        <textarea rows="1" class="form-control">${url}</textarea>
                    </div>
                    <div class="field">
                        <label class="field__label">Search Term</label>
                        <textarea rows="1" class="form-control">${searchTerm}</textarea>
                    </div>
                    <div class="field">
                        <label class="field__label">Replace Term</label>
                        <textarea rows="1" class="form-control">${replaceTerm}</textarea>
                    </div>
                    <div class="rule-card__options">
                        <span class="field__label">Options</span>
                        ${[
                            'Match case',
                            'Input fields only',
                            'Hidden content',
                            'Match whole word',
                            'Regular expression',
                            'Replace HTML',
                        ]
                            .map(
                                (label) => `
                            <div class="form-check">
                                <input type="checkbox" class="form-check-input" ${
                                    checked.includes(label) ? 'checked' : ''
                                } />
                                <label class="form-check-label">${label}</label>
                            </div>`
                            )
                            .join('')}
                    </div>
                </div>
                <div class="rule-card__actions">
                    <button type="button" class="btn-ghost">Delete</button>
                    <button type="button" class="btn-primary">Save</button>
                </div>
            </form>
        </li>`

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <link href="pages.css" rel="stylesheet" />
    <style>
        html, body { margin: 0; padding: 0; }
    </style>
</head>
<body>
    <header class="page-header">
        <div class="page-header__inner">
            <a class="brand" href="#">
                <img src="icon-128.png" width="28" height="28" alt="" />
                <span class="brand__name">Search and Replace</span>
            </a>
            <nav class="page-nav">
                <a href="#">Help</a>
                <a class="is-current" href="#" aria-current="page">Saved Rules</a>
            </nav>
        </div>
    </header>
    <main class="page-main">
        <div class="page-main__inner">
            <div class="page-title">
                <h1>Saved Rules</h1>
                <p class="page-title__lede">
                    These searches run automatically every time you open a page whose address matches their URL
                    pattern. The pattern is a regular expression, so one rule can cover a whole site.
                </p>
            </div>
            <ul class="rule-grid">
                ${rule(1, 'https://www\\.example\\.com/.*', 'Condo', 'apartment', ['Match case'])}
                ${rule(
                    2,
                    // Deliberately longer than the card, to show that the fields wrap
                    'https://en\\.wikipedia\\.org/wiki/List_of_numbers\\?action=view&amp;section=.*',
                    '1\\d1',
                    '101',
                    ['Regular expression']
                )}
            </ul>
        </div>
    </main>
    <script>
        // Mirrors autoGrowFields() in src/options.ts
        for (const field of document.querySelectorAll('textarea')) {
            field.style.height = 'auto'
            field.style.height = field.scrollHeight + 'px'
        }
    </script>
</body>
</html>`
}

/** A stand-in web page for the regular expression before/after pair */
function numberGridHarness(replaced) {
    const rows = []
    for (let start = 100; start < 210; start += 10) {
        const cells = []
        for (let n = start; n < start + 10; n++) {
            const isMatch = /^1\d1$/.test(String(n))
            const shown = isMatch && replaced ? '101' : String(n)
            cells.push(`<td${isMatch ? ' class="hit"' : ''}>${shown}</td>`)
        }
        rows.push(`<tr>${cells.join('')}</tr>`)
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <style>
        html, body { margin: 0; padding: 0; width: 560px; overflow: hidden; }
        body {
            font-family: 'Open Sans', system-ui, sans-serif;
            background: #fff;
            color: #444;
            padding: 20px 24px 24px;
        }
        h2 { font-size: 17px; margin: 0 0 4px; color: #222; }
        p { font-size: 13px; margin: 0 0 16px; color: #6b6b6b; }
        table { border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
        td { padding: 4px 9px; text-align: right; color: #3b5bbf; }
        td.hit { background: #fff3b0; color: #222; font-weight: 600; border-radius: 3px; }
    </style>
</head>
<body>
    <h2>Natural numbers</h2>
    <p>${
        replaced
            ? 'Every match has been replaced with <code>101</code>.'
            : 'The highlighted cells are the ones <code>1\\d1</code> matches.'
    }</p>
    <table><tbody>${rows.join('')}</tbody></table>
</body>
</html>`
}

async function main() {
    const only = process.argv.slice(2)
    const wanted = (name) => only.length === 0 || only.includes(name)
    const chrome = await findChrome()
    console.log(`Using ${chrome}`)

    const browser = await Browser.launch(chrome)
    const written = []

    // One harness file per shot, rather than one rewritten in place: Chrome caches file:// URLs
    // within a session, so reusing the path can screenshot the previous shot's markup
    async function shoot(name, html, width) {
        const path = harnessPath(name)
        written.push(path)
        await writeFile(path, html)
        await browser.capture(`file://${path}`, { width, output: resolve(assets, name) })
    }

    try {
        for (const shot of POPUP_SHOTS.filter((s) => wanted(s.name))) {
            await shoot(shot.name, await popupHarness(shot), POPUP_WIDTH)
        }

        if (wanted('saved-rules')) {
            await shoot('saved-rules', rulesHarness(), 720)
        }

        for (const [name, replaced] of [
            ['regex-before', false],
            ['regex-after', true],
        ]) {
            if (wanted(name)) {
                await shoot(name, numberGridHarness(replaced), 560)
            }
        }
    } finally {
        await browser.close()
        await Promise.all(written.map((path) => rm(path, { force: true })))
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
