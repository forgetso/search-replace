//Storing and retrieving popup values
chrome.extension.onConnect.addListener(function(port) {
  port.onMessage.addListener(function(msg) {
    if(!msg['recover']) {
        localStorage['searchTerm'] = msg['searchTerm'];
        localStorage['replaceTerm'] = msg['replaceTerm'];
        localStorage['case'] = msg['case'];
        localStorage['inputFieldsOnly'] = msg['inputFieldsOnly'];
        localStorage['visibleOnly'] = msg['visibleOnly'];
        localStorage['regex'] = msg['regex'];
        port.postMessage("Terms stored");
    } else {
        port.postMessage({
            searchTerm:localStorage['searchTerm'],
            replaceTerm:localStorage['replaceTerm'],
            'case':localStorage['case'],
            inputFieldsOnly:localStorage['inputFieldsOnly'],
            visibleOnly:localStorage['visibleOnly'],
            regex:localStorage['regex']
            });
    }
  });
});

chrome.runtime.onInstalled.addListener(function(details){
    if(details.reason === "install"){
        alert('Thanks for installing. Remember to REFRESH the page you wish to replace text on before using!');
    }
});