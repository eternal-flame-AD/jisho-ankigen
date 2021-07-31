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

    if (resp.meta.status !== 200)
        throw new Error(`Unexpected HTTP status from jisho.org: ${resp.meta.status}`);

    if (resp.data.length == 0)
        throw new Error("jisho.org failed to return any result.");

    let matched_entry;
    let matched_score = 0;
    for (let entry of resp.data) {
        let score = scoreSlugMatch(keyword, entry.slug);
        if (matched_score == 0 || score > matched_score) {
            matched_score = score;
            matched_entry = entry;
        }
    }

    if (!matched_entry)
        throw new Error("no entry matched");

    const ret = {
        "ja": matched_entry.japanese[0].word || matched_entry.japanese[0].reading,
        "fu": matched_entry.japanese[0].reading,
        "en": matched_entry.senses.reduce((prev, cur) => prev + (prev ? "\n" : "") + cur.english_definitions.join("; "), ""),
        "src": "jisho.org",
    };
    if (ret.fu == ret.ja) delete ret.fu;
    return ret;
}