function stripURLHash(u, origin) {
    if (u.startsWith("/") && origin)
        u = origin + u;
    const url = new URL(u);
    return url.origin + url.pathname + url.search;
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
        const url = item.querySelector("a").getAttribute("href").trim();
        const realUrl = stripURLHash(url, "https://dictionary.goo.ne.jp");
        const text = item.querySelector("p.text").innerText.trim();
        if (candidates.every((val, idx) => {
                if (val.url == realUrl) {
                    if (val.altn_urls.length == 1)
                        val.text = "(1) " + val.text;

                    val.text += `\r\n(${val.altn_urls.length+1}) ` + text;
                    val.altn_urls.push(url);
                    return false;
                }
                return true;
            }))
            candidates.push({
                "url": realUrl,
                "title": item.querySelector("p.title").innerText.trim(),
                "text": text,
                "altn_urls": [url],
            });

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
    tenseList.querySelectorAll("ol.meaning").forEach((i) => ret.jm += i.querySelectorAll(".text").innerText.trim() + "\n");
    ret.jm = ret.jm || (() => {
        const meanings = resp.querySelectorAll("div.meaning_area div.contents");
        let meaningText = "";

        meanings.forEach((i, idx) => {
            meaningText += (meanings.length > 1 ? `(${idx+1}) ` : "") + i.innerText.trim() + "\n";
        })
        return meaningText;
    })();
    if (!ret.jm)
        throw new Error("解説を見つかれない");

    return ret;
}