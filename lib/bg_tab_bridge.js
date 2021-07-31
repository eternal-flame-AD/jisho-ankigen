async function ensure_tab_script(tab) {
    const has_jquery = (await browser.tabs.executeScript(tab.id, { code: "typeof jQuery === 'function'" }))[0];
    if (!has_jquery) {
        const jq_files = [
            "jquery-ui.css",
            "jquery-ui.structure.css",
            "jquery-ui.theme.css",
            "external/jquery/jquery-3.6.0.min.js",
            "jquery-ui.min.js"
        ];
        for (const item of jq_files)
            try {
                await browser.tabs[item.endsWith(".css") ? "insertCSS" : "executeScript"](tab.id, { file: "/jquery-ui-1.12.1.noeffects/" + item });
            } catch (e) {
                console.error(`error injecting jQuery file ${item}: `, e);
                throw e;
            }
    }
    const functions = [
        "copyToClipboard",
        "handleResult",
        "selectionDialog",
    ];
    const code = JSON.stringify(functions) + ".every(i=>typeof (window[i]) === 'function')";
    console.log("verification code is:" + code);
    const ver_result = (await browser.tabs.executeScript(tab.id, { code }))[0];
    if (!ver_result)
        await browser.tabs.executeScript(tab.id, {
            file: "tab-functions.js",
        });
}

async function call_tab_function(fn, tab, ...args) {
    const code = "(args=>" + fn + "(...args))(" + JSON.stringify(args) + ");";
    console.log("code is" + code)

    return ensure_tab_script(tab).then(() => {
        return browser.tabs.executeScript(tab.id, {
            code,
        });
    });
}

function handleResult(text, title, tab) {
    call_tab_function("handleResult", tab, text, title).catch((error) => {
        // This could happen if the extension is not allowed to run code in
        // the page, for example if the tab is a privileged page.
        console.error("Failed to copy text: " + error);
        throw error;
    });
}

function selectionDialog(id, options, tab) {
    call_tab_function("selectionDialog", tab, id, options, tab.id).catch((error) => {
        // This could happen if the extension is not allowed to run code in
        // the page, for example if the tab is a privileged page.
        console.error("Failed to show dialog: " + error);
        throw error;
    });
}