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

function getFirstTextNode(node) {
    let firstText = "";
    for (const curNode of node.childNodes) {
        if (curNode.nodeName === "#text") {
            firstText = curNode.nodeValue;
            break;
        }
    }
    return firstText;
}

browser.runtime.onMessage.addListener((request, sender, response) => {
    switch (request.type) {
        case "dialog-select":
            switch (request.id) {
                case "goo-ja-query":
                    gooJnGetDefinition(request.key).then(async(text) => {
                        handleResult(text, "goo.jp 国語辞典", browser.tabs.get(request.tabid));
                    }).catch(err => {
                        handleResult({ err: err.toString() }, "", browser.tabs.get(request.tabid));
                    });
                    break;
                default:
                    console.error("Unknown dialog: " + request.id);
            }
            break;
        default:
            console.error("Unknown message: " + request);

    }
})

function handleResult(text, title, tab) {
    // // https://github.com/mdn/webextensions-examples/blob/master/context-menu-copy-link-with-types/background.js
    const code = "(args=>handleResult(args.text, args.title))(" + JSON.stringify({ text, title }) + ");";
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

function selectionDialog(id, options, tab) {
    const code = "(args=>selectionDialog(args.id, args.options, args.tabid))(" + JSON.stringify({ id, options, tabid: tab.id }) + ")";
    console.log("code is" + code)
    ensure_tab_script(tab).then(() => {
        return browser.tabs.executeScript(tab.id, {
            code,
        });
    }).catch((error) => {
        // This could happen if the extension is not allowed to run code in
        // the page, for example if the tab is a privileged page.
        console.error("Failed to show dialog: " + error);
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

async function gooJnFetchHtml(url) {
    if (url.startsWith("/"))
        url = "https://dictionary.goo.ne.jp" + url
    const respHTML = await fetch(url, {
        headers: new Headers({
            "Accept": "text/html",
        })
    });
    if (respHTML.redirected)
        return respHTML.url;
    const parser = new DOMParser();
    return parser.parseFromString(await respHTML.text(), 'text/html');
}

async function gooJnGetCandidates(prefix) {
    const resp = await gooJnFetchHtml("https://dictionary.goo.ne.jp/srch/jn/" + encodeURIComponent(prefix) + "/m0u/");

    if (typeof resp === "string")
        return [{ url: resp, title: prefix, text: "" }];

    const candList = resp.querySelector("div.section ul.content_list");
    let candidates = [];
    candList.querySelectorAll("li").forEach(item => {
        candidates.push({
            "url": item.querySelector("a").getAttribute("href").trim(),
            "title": item.querySelector("p.title").innerText.trim(),
            "text": item.querySelector("p.text").innerText.trim(),
        })
    })
    return candidates;
}

async function gooJnGetDefinition(candidateURL) {
    const resp = await gooJnFetchHtml(candidateURL);
    const tenseList = resp.querySelector("div.section");

    const keyword = resp.querySelector("div#NR-main h1");

    let ret = {
        "ja": getFirstTextNode(keyword),
        "fu": (i => i ? i.innerText.replace(/^[(（]/, "").replace(/[)）]$/, "") : "")(keyword.querySelector("span.yomi")),
        "jm": "",
        "src": "goo_jp",
    }
    tenseList.querySelectorAll("ol.meaning").forEach((i) => ret.jm += i.querySelectorAll(".text").innerText + "\n");
    ret.jm = ret.jm || resp.querySelector("div.meaning_area div.contents").innerText;

    return ret;
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
                    "src": "jisho.org",
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
browser.contextMenus.create({
    id: "query-goo-ja",
    title: "Query Goo.jp 国語辞書",
    contexts: ["selection", "editable", "link"]
})
browser.contextMenus.onClicked.addListener((info, tab) => {
    const highlightText = (info.selectionText || info.linkText).replaceAll(/\s/g, "").toLocaleLowerCase();
    switch (info.menuItemId) {
        case "query-jisho":
            console.log(`Got selection text ${highlightText}`);
            jishoGetKeyword(highlightText).then(async(text) => {
                handleResult(text, "jisho.org 結果", tab);
            }).catch(err => {
                handleResult({ err: err.toString() }, "", tab);
            });
            break;
        case "query-goo-ja":
            console.log(`Got selection text ${highlightText}`);
            gooJnGetCandidates(highlightText).then(async(candidates) => {
                if (candidates.length == 0)
                    handleResult({ err: "Goo.jp returned no results" });
                else if (candidates.length == 1)
                    gooJnGetDefinition(candidates[0].url).then(async(text) => {
                        handleResult(text, "goo.jp 国語辞典", tab);
                    }).catch(err => {
                        handleResult({ err: err.toString() }, "", tab);
                    });
                else {
                    let options = {};
                    for (const cand of candidates) {
                        options[cand.url] = cand.title + "：　" + cand.text;
                    }
                    selectionDialog("goo-ja-query", options, tab);
                }
            }).catch(err => {
                handleResult({ err: err.toString() }, "", tab);
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