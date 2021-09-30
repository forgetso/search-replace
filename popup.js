document.addEventListener('DOMContentLoaded', function () {
    const fadeEffect = function () {
        return {
            init: function (id, flag, target) {
                this.elem = document.getElementById(id);
                clearInterval(this.elem.si);
                this.target = target ? target : flag ? 100 : 0;
                this.flag = flag || -1;
                this.alpha = this.elem.style.opacity ? parseFloat(this.elem.style.opacity) * 100 : 0;
                this.elem.si = setInterval(function () {
                    fadeEffect.tween()
                }, 20);
            },
            tween: function () {
                if (this.alpha === this.target) {
                    clearInterval(this.elem.si);
                } else {
                    const value = Math.round(this.alpha + ((this.target - this.alpha) * .05)) + (1 * this.flag);
                    this.elem.style.opacity = value / 100;
                    this.elem.style.filter = 'alpha(opacity=' + value + ')';
                    this.alpha = value
                }
            }
        }
    }();

    //Set the onchange and onkeydown functions for the input fields
    let inputs = document.getElementsByClassName('data_field');
    for (const input of inputs) {
        input.onkeydown = input.onchange = function () {
        }
    }

    //Get the stored values
    var port = chrome.extension.connect({
        name: "Search and Replace"
    });
    port.postMessage({
        recover: 1
    });
    port.onMessage.addListener(function (msg) {
        if (typeof (msg['searchTerm']) !== 'undefined') {
            document.getElementById('searchTerm')
                .value = msg['searchTerm'];
        }
        if (typeof (msg['replaceTerm']) !== 'undefined') {
            document.getElementById('replaceTerm')
                .value = msg['replaceTerm'];
        }
        const checkboxes = ['case', 'inputFieldsOnly', 'visibleOnly', 'regex']
        for (const checkbox of checkboxes) {
            if (msg[checkbox] === "1") {
                document.getElementById(checkbox).checked = true;
            }
        }

    });

    document.querySelector('#next').addEventListener('click', function () {
        clickHandler(0);
    });
    document.querySelector('#all').addEventListener('click', function () {
        clickHandler(1);
    });
    const elementEvents = {
        'searchTerm': ['change', 'keyup', 'blur'],
        'replaceTerm': ['change', 'keyup', 'blur'],
        'case': ['change', 'click'],
        'inputFieldsOnly': ['change', 'click'],
        'visibleOnly': ['change', 'click'],
        'regex': ['change'],
        'help': ['click']
    }
    const eventTypeFunction = {'change': storeTerms, 'keyup': storeTerms, 'blur': storeTerms}
    for (const elementName in elementEvents) {
        for (const eventType of elementEvents[elementName]) {
            console.log('adding event listener', elementName, eventType, 'storeTerms')
            document.getElementById(elementName).addEventListener(eventType, storeTerms);
        }
    }
    document.getElementById('help')
        .addEventListener('click', openHelp);

});

function clickHandler(replaceAll) {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('content').style.display = "none";
    const searchTerm = document.getElementById('searchTerm').value;
    const replaceTerm = document.getElementById('replaceTerm').value;
    const globalFlag = replaceAll ? 'g' : '';
    const flags = document.getElementById('case').checked ? globalFlag : globalFlag + 'i';
    const inputFieldsOnly = document.getElementById('inputFieldsOnly').checked;
    const visibleOnly = document.getElementById('visibleOnly').checked;
    const isRegex = document.getElementById('regex').checked;
    chrome.tabs.getSelected(null, function (tab) {
        chrome.tabs.sendRequest(tab.id, {
            searchTerm: searchTerm,
            replaceTerm: replaceTerm,
            flags: flags,
            inputFieldsOnly: inputFieldsOnly,
            visibleOnly: visibleOnly,
            regex: isRegex,
            url: tab.url,
        }, function (response) {
            document.getElementById('loader').style.display = "none";
            document.getElementById('content').style.display = "block";
        });
    });
};

function storeTerms(e) {
    e = e || window.event;
    if (e.keyCode === 13) {
        //if the user presses enter we want to trigger the search replace
        clickHandler();
    } else {
        const searchTerm = document.getElementById('searchTerm').value;
        const replaceTerm = document.getElementById('replaceTerm').value;
        const caseFlag = document.getElementById('case').checked ? 1 : 0;
        const inputFieldsOnly = document.getElementById('inputFieldsOnly').checked ? 1 : 0;
        const visibleOnly = document.getElementById('visibleOnly').checked ? 1 : 0;
        const re = document.getElementById('regex').checked ? 1 : 0;
        const port = chrome.extension.connect({
            name: "Search and Replace"
        });
        port.postMessage({
            recover: 0,
            searchTerm: searchTerm,
            replaceTerm: replaceTerm,
            case: caseFlag,
            inputFieldsOnly: inputFieldsOnly,
            visibleOnly: visibleOnly,
            regex: re
        });
        port.onMessage.addListener(function (msg) {
            console.log("message received" + msg);
        });
    }
}

function openHelp() {
    chrome.tabs.create({
        url: "help.html"
    });
}