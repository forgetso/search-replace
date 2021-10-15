const INPUT_ELEMENTS_AND_EVENTS = {
    'searchTerm': ['change', 'keyup', 'blur'],
    'replaceTerm': ['change', 'keyup', 'blur'],
    'case': ['change', 'click'],
    'inputFieldsOnly': ['change', 'click'],
    'visibleOnly': ['change', 'click'],
    'regex': ['change'],
    'help': ['click']
};

const CHECKBOXES = ['case', 'inputFieldsOnly', 'visibleOnly', 'regex'];

document.addEventListener('DOMContentLoaded', function () {

    // Set the onchange and onkeydown functions for the input fields
    let inputs: HTMLCollectionOf<Element> = document.getElementsByClassName('data_field');
    for (const el of inputs) {
        const inputElement = <HTMLInputElement>el
        inputElement.onkeydown = inputElement.onchange = function () {
        }
    }

    // Get the stored values
    const port = tabConnect();
    port.postMessage({
        recover: 1
    });

    // Add event listeners
    port.onMessage.addListener(function (msg) {
        console.log(msg);
        if (typeof (msg['searchTerm']) !== 'undefined') {
            (<HTMLInputElement>document.getElementById('searchTerm'))
                .value = msg['searchTerm'];
        }
        if (typeof (msg['replaceTerm']) !== 'undefined') {
            (<HTMLInputElement>document.getElementById('replaceTerm'))
                .value = msg['replaceTerm'];
        }

        for (const checkbox of CHECKBOXES) {
            if (msg[checkbox] === 1) {
                (<HTMLInputElement>document.getElementById(checkbox)).checked = true;
            }
        }

    });

    //Click events for Replace Next, Replace All buttons and Help link
    (<HTMLButtonElement>document.querySelector('#next')).addEventListener('click', function () {
        clickHandler(0);
    });
    (<HTMLButtonElement>document.querySelector('#all')).addEventListener('click', function () {
        clickHandler(1);
    });
    (<HTMLAnchorElement>document.getElementById('help'))
        .addEventListener('click', openHelp);

    // Handlers for input elements changing value - storeTerms
    for (const elementName in INPUT_ELEMENTS_AND_EVENTS) {
        for (const eventType of INPUT_ELEMENTS_AND_EVENTS[elementName]) {
            (<HTMLInputElement>document.getElementById(elementName)).addEventListener(eventType, storeTerms);
        }
    }


});

function clickHandler(replaceAll) {
    const loader = document.getElementById("loader");
    loader!.style.display = 'block';
    const content = document.getElementById('content');
    content!.style.display = "none";
    const {searchTerm, replaceTerm, caseFlag, inputFieldsOnly, visibleOnly, isRegex} = getInputValues();
    const globalFlag = replaceAll ? 'g' : '';
    const flags = caseFlag ? globalFlag : globalFlag + 'i';
    const query = {active: true, currentWindow: true};
    chrome.tabs.query(query, function (tabs) {
        const tab = tabs[0];
        if (tab.id != null) {
            chrome.tabs.sendMessage(tab.id, {
                searchTerm: searchTerm,
                replaceTerm: replaceTerm,
                flags: flags,
                inputFieldsOnly: inputFieldsOnly,
                visibleOnly: visibleOnly,
                regex: isRegex,
                url: tab.url,
            }, function (response) {
                loader!.style.display = "none";
                content!.style.display = "block";
            });
        }
    });
};

function storeTerms(e) {
    e = e || window.event;
    if (e.keyCode === 13) {
        //if the user presses enter we want to trigger the search replace
        clickHandler(false);
    } else {
        const {searchTerm, replaceTerm, caseFlag, inputFieldsOnly, visibleOnly, isRegex} = getInputValues();
        const port = tabConnect();
        port.postMessage({
            recover: 0,
            searchTerm: searchTerm,
            replaceTerm: replaceTerm,
            case: caseFlag ? 1 : 0,
            inputFieldsOnly: inputFieldsOnly ? 1 : 0,
            visibleOnly: visibleOnly ? 1 : 0,
            regex: isRegex ? 1 : 0
        });
        port.onMessage.addListener(function (msg) {
            console.log("Message received: " + msg);
        });
    }
}

function tabConnect() {
    return chrome.runtime.connect(null!, {
        name: "Search and Replace"
    });
}

function getInputValues() {
    const searchTerm = (<HTMLInputElement>document.getElementById('searchTerm')).value;
    const replaceTerm = (<HTMLInputElement>document.getElementById('replaceTerm')).value;
    const caseFlag = (<HTMLInputElement>document.getElementById('case')).checked;
    const inputFieldsOnly = (<HTMLInputElement>document.getElementById('inputFieldsOnly')).checked;
    const visibleOnly = (<HTMLInputElement>document.getElementById('visibleOnly')).checked;
    const isRegex = (<HTMLInputElement>document.getElementById('regex')).checked;
    return {searchTerm, replaceTerm, caseFlag, inputFieldsOnly, visibleOnly, isRegex}
}

function openHelp() {
    chrome.tabs.create({
        url: "assets/help.html"
    });
}