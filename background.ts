//Storing and retrieving popup values

chrome.runtime.onConnect.addListener(function (port) {
    port.onMessage.addListener(function (msg) {
        if (!msg['recover']) {
            chrome.storage.local.set({
                'options': {
                    'searchTerm': msg['searchTerm'],
                    'replaceTerm': msg['replaceTerm'],
                    'case': msg['case'],
                    'inputFieldsOnly': msg['inputFieldsOnly'],
                    'visibleOnly': msg['visibleOnly'],
                    'regex': msg['regex']
                }
            }, function () {
                port.postMessage("Terms stored");
            });
        } else {
            chrome.storage.local.get(['options'], function (result) {
                if (result.options) {
                    port.postMessage({
                        searchTerm: result.options['searchTerm'],
                        replaceTerm: result.options['replaceTerm'],
                        'case': result.options['case'],
                        inputFieldsOnly: result.options['inputFieldsOnly'],
                        visibleOnly: result.options['visibleOnly'],
                        regex: result.options['regex']
                    })
                }
            });
        }
    })
});

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === "install") {
        chrome.notifications.create('install', {
            type: 'basic',
            title: 'Search and Replace',
            iconUrl: 'assets/icon.png',
            message: 'Thanks for installing. Remember to REFRESH the page you wish to replace text on before using!',
            priority: 2,
            buttons: [{'title': 'Ok'}]
        });
    }
});