module.exports = (on, config) => {
    on('before:browser:launch', (browser, launchOptions) => {
        // supply the absolute path to an unpacked extension's folder
        // NOTE: extensions cannot be loaded in headless Chrome
        console.log('current working directory', process.cwd())
        launchOptions.extensions.push('../../../dist')
        return launchOptions
    })
}
