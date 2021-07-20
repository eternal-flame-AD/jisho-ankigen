function escapeHTML(str) {
    // https://stackoverflow.com/questions/3043775/how-to-escape-html
    return new Option(str).innerHTML.replace(/\n/g, "<br/>");
}

function copyToClipboard(obj) {
    // https://github.com/mdn/webextensions-examples/blob/master/context-menu-copy-link-with-types/clipboard-helper.js
    function oncopy(event) {
        document.removeEventListener("copy", oncopy, true);
        // Hide the event from the page to prevent tampering.
        event.stopImmediatePropagation();

        // Overwrite the clipboard content.
        event.preventDefault();
        const objStr = JSON.stringify(obj);
        event.clipboardData.setData("text/plain", objStr);
    }
    document.addEventListener("copy", oncopy, true);

    // Requires the clipboardWrite permission, or a user gesture:
    document.execCommand("copy");
}

async function saveToStorage(text, testOnly) {
    let hist = await (new Promise(resolve => browser.storage.sync.get("query-history", resolve)));
    if (!("query-history" in hist))
        hist = { "query-history": [] }
    hist = hist["query-history"];
    console.log("original hist is:" + JSON.stringify(hist));
    let existIdx = -1;
    for (let idx in hist)
        if (text["ja"] === hist[idx]["ja"]) existIdx = idx;
    if (testOnly) return existIdx >= 0;

    if (existIdx >= 0)
        Object.assign(hist[existIdx], text);
    else
        hist.push(text);

    console.log("new history is " + JSON.stringify(hist));
    await browser.storage.sync.set({ "query-history": hist });
    return true;
}

function selectionDialog(id, options, tabid) {
    let msgHtml = "";
    for (const key in options) {
        msgHtml += `<input type="radio" name="${btoa(id)}" id="${btoa(key)}"> <label for="${btoa(key)}">${options[key]}</label> <br/>`
    }

    const elem = jQuery("#yume-jisho-ankigen-dialog");
    elem.html(msgHtml)
    elem.dialog({
        title: "選択：",
        buttons: [{
                text: "OK",
                click: function() {
                    browser.runtime.sendMessage({
                        type: "dialog-select",
                        id,
                        tabid,
                        key: atob(jQuery("#yume-jisho-ankigen-dialog input[name=\"" + btoa(id) + "\"]:checked").attr("id")),
                    })
                    jQuery(this).dialog("close");
                }
            },
            {
                text: "Cancel",
                click: function() {
                    jQuery(this).dialog("close");
                }
            },
        ]
    })
}

function handleResult(msg, title) {
    console.log(title);
    let msgHtml = "";
    let success = false
    if (msg.err) {
        title = title || "異常";
        msgHtml = escapeHTML(msg.err);
    } else {
        title = title || "結果"
        success = true;
        for (const key in msg)
            msgHtml += `<tr> <td style="background-color: #ececec; width: 2em;">${escapeHTML(key)}</td><td> ${escapeHTML(msg[key])}</td>`;
        msgHtml = "<table>" + msgHtml + "</table>";
    }
    const elem = jQuery("#yume-jisho-ankigen-dialog");
    elem.html(msgHtml)
    if (success) {
        saveToStorage(msg, true).then((exist) => {
            elem.dialog({
                title,
                minWidth: 600,
                buttons: [{
                        text: exist ? "Already Saved" : "Save",
                        click: exist ? undefined : function() {
                            saveToStorage(msg).finally(() => {
                                jQuery(this).dialog("close");
                            });
                        },
                        disables: !exist,
                    },
                    {
                        text: "Copy JSON",
                        click: function() {
                            copyToClipboard(msg);
                        }
                    },
                    {
                        text: "Discard",
                        click: function() {
                            jQuery(this).dialog("close");
                        }
                    },
                ]
            });
        })
    } else {
        elem.dialog({
            buttons: [{
                text: "Close",
                click: function() {
                    jQuery(this).dialog("close");
                }
            }, ]
        });
    }


    return true;
}


if (!document.getElementById("yume-jisho-ankigen-dialog")) {
    const dialog_elem = document.createElement("div");
    dialog_elem.setAttribute("id", "yume-jisho-ankigen-dialog");
    document.body.appendChild(dialog_elem);
}

_ = undefined // make firefox happy