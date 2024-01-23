import * as path from 'node:path'

module.exports = (on, config) => {
    const extensionPath = path.resolve('../../../dist')
    console.log('extension path', extensionPath, 'config', config)
    on('before:browser:launch', (browser, launchOptions) => {
        // supply the absolute path to an unpacked extension's folder
        // NOTE: extensions cannot be loaded in headless Chrome
        console.log('current working directory', process.cwd())

        console.log('extension path', extensionPath)
        if (browser.family === 'chromium') {
            launchOptions.args.push(`--load-extension=${extensionPath}`)
        }
        return launchOptions
    })
}
