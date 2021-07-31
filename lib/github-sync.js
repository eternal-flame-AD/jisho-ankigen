function githubAPIHeaders(username, token, postJSON) {
    let headers = new Headers();
    headers.append("Authorization", "Basic " + Base64.encode(username + ":" + token));
    headers.append("Accept", "application/vnd.github.v3+json");
    if (postJSON)
        headers.append("content-type", "application/json");
    return headers;
}

async function testGithubSettings(githubSet) {
    if (!githubSet) {
        githubSet = (await browser.storage.sync.get("github-sync-settings"))["github-sync-settings"]
        if (!githubSet) {
            githubSet = {
                "token": "",
                "repo": "",
                "dir": "",
                "username": "",
            };
            await browser.storage.sync.set({ "github-sync-settings": githubSet });
        }
        if (![githubSet.repo, githubSet.token, githubSet.username].every(i => i.length > 0)) {
            githubSet.message = "Setup incomplete.";
            githubSet.ready = false;
            return githubSet;
        }
    }
    try {
        let githubResponse = (await (await fetch(
            "https://api.github.com/repos/" + githubSet.repo + "/contents/" + githubSet.dir, {
                headers: githubAPIHeaders(githubSet.username, githubSet.token)
            }
        )).json());
        if (githubResponse.message) {
            githubSet.message = "github responded with: " + githubResponse.message;
            githubSet.ready = false;
            return githubSet
        }

        if (!(githubResponse instanceof Array)) {
            githubSet.message = "specified path is not a directory";
            githubSet.ready = false;
            return githubSet
        }
        githubSet.message = "OK.";
        githubSet.ready = true;
        return githubSet;
    } catch (e) {
        githubSet.message = e.message;
        githubSet.ready = false;
        return githubSet;
    }
}

async function syncHistoryToGithub() {
    let queryHistory = (await browser.storage.sync.get("query-history"))["query-history"];
    let githubSet = await testGithubSettings();
    const timeStampStr = new Date().toISOString().replace(/\..+$/, "");
    const fileName = `generated_jisho-ankigen_${timeStampStr}.json`;
    const message = `[jisho-ankigen] sync at ${timeStampStr}`;
    const content = Base64.encode(JSON.stringify(queryHistory, "", "\t") + "\n");
    let githubResponse = (await (await fetch(
        "https://api.github.com/repos/" + githubSet.repo + "/contents/" + githubSet.dir + "/" + fileName, {
            headers: githubAPIHeaders(githubSet.username, githubSet.token, true),
            method: "PUT",
            body: JSON.stringify({
                message,
                content,
            })
        }
    )).json());
    if (githubResponse.message) throw new Error("github responded: " + githubResponse.message);
    await browser.storage.sync.set({ "github-last-sync": +new Date() });
}

async function heuristicallySyncToGithub() {
    let queryHistory = (await browser.storage.sync.get("query-history"))["query-history"];
    if (queryHistory.length == 0)
        return false;

    let lastSync = (await browser.storage.sync.get("github-last-sync"))["github-last-sync"];
    const curTime = +new Date();
    if (lastSync && (curTime - lastSync) < 3600 * 1000 * 4)
        return false;

    await syncHistoryToGithub();
    await browser.storage.sync.set({ "query-history": [] });
    return true;
}

browser.idle.setDetectionInterval(600);
browser.idle.onStateChanged.addListener((state) => {
    if (state != "idle" && state != "locked")
        return;
    heuristicallySyncToGithub().catch(console.error);
})