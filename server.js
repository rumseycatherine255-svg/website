# server.js (FIXED)

```js
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.json());

const workspaces = new Map();

async function getMembershipPath(userId, groupId, apiKey) {
  const res = await axios.get(
    `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships?filter=user==${userId}`,
    { headers: { "x-api-key": apiKey } }
  );

  const membership =
    res.data.groupMemberships?.[0] ||
    res.data.data?.[0] ||
    null;

  if (!membership || !membership.path) {
    console.error("Membership lookup failed:", res.data);
    throw new Error("User membership not found in group");
  }

  return membership.path;
}

async function setRank(ws, userId, newRank) {
  const path = await getMembershipPath(userId, ws.groupId, ws.apiKey);

  await axios.patch(
    `https://apis.roblox.com/cloud/v2/${path}`,
    {
      role: `groups/${ws.groupId}/roles/${newRank}`
    },
    {
      headers: {
        "x-api-key": ws.apiKey,
        "Content-Type": "application/json"
      }
    }
  );
}

app.post("/api/ws/:id/rank", async (req, res) => {
  try {
    const ws = workspaces.get(req.params.id);
    if (!ws) throw new Error("Workspace not found");

    const { userId, action } = req.body;

    const current = ws.ranks.find(r => r.userId == userId);
    if (!current) throw new Error("User not in rank cache");

    const protectedRank = Number(ws.protectedRank || 255);
    if (Number(current.rank) >= protectedRank)
      throw new Error("User is protected and cannot be ranked");

    let newRank = current.rank;

    if (action === "promote") newRank++;
    if (action === "demote") newRank--;
    if (action === "setrank") newRank = Number(req.body.rank);

    await setRank(ws, userId, newRank);

    res.json({ success: true, newRank });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

# index.html (FIXED)

```html
<!DOCTYPE html>
<html>
<head>
<title>Ranking Panel</title>
<style>
body { font-family: Arial; background:#0f172a; color:white; }
button { padding:6px 10px; margin:2px; }
</style>
</head>
<body>

<h2>Ranking Panel</h2>
<input id="username" placeholder="Username" />
<button onclick="promote()">Promote</button>
<button onclick="demote()">Demote</button>

<script>
const CURRENT_WS = { id: "main" };

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function toast(msg){ alert(msg); }

async function doRank(action){
  const username = document.getElementById("username").value;

  const body = {
    username,
    action
  };

  const data = await api('POST', `/api/ws/${CURRENT_WS.id}/rank`, body);

  if (data.success) {
    toast('✓ ' + username + ' → ' + data.newRank);
    loadMembers();
  } else {
    toast('Error: ' + data.error);
  }
}

function promote(){ doRank("promote"); }
function demote(){ doRank("demote"); }

function loadMembers(){
  console.log("refreshing members...");
}
</script>

</body>
</html>
```
