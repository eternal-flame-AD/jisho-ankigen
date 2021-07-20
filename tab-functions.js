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
    let exists = false;
    for (let idx in hist)
        if (text["ja"] === hist[idx]["ja"]) exists = true;
    if (testOnly) return exists;
    exists || hist.push(text);
    console.log("new history is " + JSON.stringify(hist));
    await browser.storage.sync.set({ "query-history": hist });
    return true;
}

function handleResult(msg) {
    let msgHtml = "";
    let success = false
    if (msg.err) {
        msgHtml = escapeHTML(msg.err);
    } else {
        success = true;
        for (const key in msg)
            msgHtml += `<tr> <td style="background-color: #ececec; width: 2em;">${escapeHTML(key)}</td><td> ${escapeHTML(msg[key])}</td>`;
        msgHtml = "<table>" + msgHtml + "</table>";
    }
    const elem = jQuery("#yume-jisho-ankigen-dialog");
    elem.attr("title", "")
    elem.html(msgHtml)
    if (success) {
        saveToStorage(msg, true).then((exist) => {
            elem.dialog({
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