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

async function handleKeywordQuery(queryType, keyword, tab) {
    switch (queryType) {
        case "query-jisho":
            console.log(`Got selection text ${keyword}`);
            try {
                const text = await jishoGetKeyword(keyword);
                handleResult(text, "jisho.org 結果", tab)
            } catch (err) {
                handleResult({ err: err.toString() }, "", tab);
            }
            break;
        case "query-goo-ja":
            console.log(`Got selection text ${keyword}`);
            try {
                const candidates = await gooJnGetCandidates(keyword)
                if (candidates.length == 0)
                    handleResult({ err: "Goo.jp returned no results" });
                else if (candidates.length == 1) {
                    const text = await gooJnGetDefinition(candidates[0].url);
                    handleResult(text, "goo.jp 国語辞典", tab);
                } else {
                    let options = {};
                    for (const cand of candidates) {
                        options[cand.url] = cand.title + "：　" + cand.text;
                    }
                    selectionDialog("goo-ja-query", options, tab);
                }
            } catch (err) {
                handleResult({ err: err.toString() }, "", tab);
            }
            break;
        default:
            console.warn(`Could not determine query type ${queryType}`);
    }
}

browser.contextMenus.create({
    id: "query-jisho",
    title: "Query jisho.org",
    contexts: ["selection", "editable", "link", "page"]
})
browser.contextMenus.create({
    id: "query-goo-ja",
    title: "Query Goo.jp 国語辞書",
    contexts: ["selection", "editable", "link", "page"]
})
browser.contextMenus.onClicked.addListener(async(info, tab) => {
    const highlightText = (info.selectionText || info.linkText || (await navigator.clipboard.readText())).replaceAll(/\s/g, "").toLocaleLowerCase();
    await handleKeywordQuery(info.menuItemId, highlightText, tab);
})