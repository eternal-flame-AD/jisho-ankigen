const masked = "********";




document.getElementById("github-commit-history").onclick = (e) => {
    if (e.target.disabled)
        return;

    syncHistoryToGithub().catch(e => {
        alert("An error occurred: " + e.message);
        throw e;
    }).then(() => {
        browser.storage.sync.set({ "query-history": [] }).then(() => {
            window.location.reload();
        })
    })
}

(async () => {
    let githubSet = await testGithubSettings();
    document.getElementById("github-sync-status").innerText = githubSet.message;
    let lastSyncTs = (await browser.storage.sync.get("github-last-sync"))["github-last-sync"] || 0;
    document.getElementById("github-sync-last-ts").innerText = !lastSyncTs ? "Never" : new Date(lastSyncTs);
    document.getElementById("github-token").value = githubSet["token"] ? masked : "";
    document.getElementById("github-dir").value = githubSet["dir"];
    document.getElementById("github-repo").value = githubSet["repo"];
    document.getElementById("github-username").value = githubSet["username"];
    document.getElementById("github-commit-history").disabled = githubSet.ready !== true;
    browser.storage.sync.get("query-history", (json) => {
        let records = json["query-history"];
        if (records.length == 0)
            document.getElementById("github-commit-history").disabled = true;
    });
})().catch(console.error)



document.getElementById("github-sync-form").onsubmit = (e) => {
    e.preventDefault();
    (async () => {
        let githubSet = (await browser.storage.sync.get("github-sync-settings"))["github-sync-settings"];
        let token = document.getElementById("github-token").value;
        if (token !== masked) githubSet["token"] = token;
        githubSet["repo"] = document.getElementById("github-repo").value;
        githubSet["dir"] = document.getElementById("github-dir").value.replace(/.\/$/, "");
        githubSet["username"] = document.getElementById("github-username").value;
        await browser.storage.sync.set({ "github-sync-settings": githubSet });
    })().then(() => window.location.reload()).catch(console.error)
}

document.getElementById("copy-history").onclick = () => {
    let str = document.getElementById("query-history").innerText;
    navigator.clipboard.writeText(str);
}

document.getElementById("clear-history").onclick = () => {
    const el = document.getElementById("clear-history");
    if (el.getAttribute("data-prompted") === "1")
        browser.storage.sync.set({ "query-history": [] }).then(() => {
            window.location.reload();
        })
    else {
        el.setAttribute("style", "color: #ff0000");
        el.setAttribute("value", "Confirm?");
        el.setAttribute("data-prompted", 1);
    }
}

function toggleHistory() {

    browser.storage.sync.get("query-history", (json) => {
        let records = json["query-history"];
        if (records.length == 0)
            document.getElementById("github-commit-history").disabled = true;
        if (!records)
            browser.storage.sync.set({ "query-history": [] }).then(() => {
                window.location.reload();
            })
        if (document.getElementById("query-history").getAttribute("data-hidden") === "1") {
            document.getElementById("query-history").setAttribute("data-hidden", "0");
            document.getElementById('query-history').innerText = JSON.stringify(records, "", "\t");
        } else {
            document.getElementById('query-history').innerText = records.length + " record(s)...";
            document.getElementById("query-history").setAttribute("data-hidden", "1");
        }


    });
}

document.getElementById("toggle-history").onclick = toggleHistory;
toggleHistory();
