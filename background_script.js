// Put all the javascript code here, that you want to execute in background.
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
    ];
    const code = JSON.stringify(functions) + ".every(i=>typeof (window[i]) === 'function')";
    console.log("verification code is:" + code);
    const ver_result = (await browser.tabs.executeScript(tab.id, { code }))[0];
    if (!ver_result)
        await browser.tabs.executeScript(tab.id, {
            file: "tab-functions.js",
        });

}

function handle_result(text, tab) {
    // // https://github.com/mdn/webextensions-examples/blob/master/context-menu-copy-link-with-types/background.js
    const code = "handleResult(" + JSON.stringify(text) + ");";
    console.log("code is" + code)

    ensure_tab_script(tab).then(() => {
        return browser.tabs.executeScript(tab.id, {
            code,
        });
    }).catch((error) => {
        // This could happen if the extension is not allowed to run code in
        // the page, for example if the tab is a privileged page.
        console.error("Failed to copy text: " + error);
        throw error;
    });
}

function scoreSlugMatch(keyword, slug, noStrip) {
    slug = slug.replaceAll(/[0-9a-zA-Z,^=-_]/g, "");
    if (keyword == slug) {
        return 100;
    }
    if (slug.startsWith(keyword)) {
        return 95;
    }
    if (keyword.length > 2) {
        keyword = keyword.substr(0, keyword.length - 1);
        if (slug.startsWith(keyword)) {
            return 90;
        }
        keyword = keyword.substr(0, keyword.length - 2);
        if (slug.startsWith(keyword)) {
            return 85;
        }
    }
    if ((keyword.replaceAll(/[ a-zA-Z'"]/g), "").length == 0)
        return 5;

    return 0;
}

async function jishoGetKeyword(keyword) {
    const Url = "https://jisho.org/api/v1/search/words?keyword=" + encodeURIComponent(keyword);
    const respJSON = await fetch(Url);
    const resp = await respJSON.json();
    switch (resp.meta.status) {
        case 200:
            if (resp.data.length == 0) {
                throw new Error("jisho.org failed to return any result.");
            } else {
                let matched_entry = null;
                let matched_score = 0;
                for (let entry of resp.data) {
                    let score = scoreSlugMatch(keyword, entry.slug);
                    if (matched_score == 0 || score > matched_score) {
                        matched_score = score;
                        matched_entry = entry;
                    }
                }
                if (matched_entry == null) {
                    throw new Error("no entry matched");
                }
                const ret = {
                    "ja": matched_entry.japanese[0].word || matched_entry.japanese[0].reading,
                    "fu": matched_entry.japanese[0].reading,
                    "en": matched_entry.senses.reduce((prev, cur) => prev + (prev ? "\n" : "") + cur.english_definitions.join("; "), ""),
                };
                if (ret.fu == ret.ja) delete ret.fu;
                return ret;
            }
        default:
            throw new Error(`Unexpected Status Code from jisho.org: ${resp.meta.status}`);
    }
}

browser.contextMenus.create({
    id: "query-jisho",
    title: "Query jisho.org",
    contexts: ["selection", "editable", "link"]
})
browser.contextMenus.onClicked.addListener((info, tab) => {
    switch (info.menuItemId) {
        case "query-jisho":
            const highlightText = (info.selectionText || info.linkText).replaceAll(/\s/g, "").toLocaleLowerCase();
            console.log(`Got selection text ${highlightText}`);
            jishoGetKeyword(highlightText).then(async(text) => {
                handle_result(text, tab);
            }).catch(err => {
                handle_result({ err: err.toString() }, tab);
            });
            break;
        default:
            console.warn(`Could not determine contextMenu type ${info.menuItemId}`);
    }
    return
})

browser.idle.setDetectionInterval(600);
browser.idle.onStateChanged.addListener((state) => {
    if (state != "idle" && state != "locked")
        return;
    heuristicallySyncToGithub().catch(console.error);
})