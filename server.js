const express = require("express");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const Datastore = require("nedb-promises");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "rotools-secret-change-in-production";

// ── Database ──────────────────────────────────────────────────
const db = {
  users:      Datastore.create({ filename: "./data/users.db",      autoload: true }),
  workspaces: Datastore.create({ filename: "./data/workspaces.db", autoload: true }),
  wsUsers:    Datastore.create({ filename: "./data/wsusers.db",    autoload: true }),
  log:        Datastore.create({ filename: "./data/log.db",        autoload: true }),
  whitelist:  Datastore.create({ filename: "./data/whitelist.db",  autoload: true }),
};

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Auth middleware ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

// ── Roblox helpers ────────────────────────────────────────────
async function fetchGroupRoles(groupId) {
  const res = await axios.get(`https://groups.roblox.com/v1/groups/${groupId}/roles`);
  return res.data.roles
    .filter(r => r.rank > 0 && r.rank < 255)
    .map(r => ({ rank: r.rank, id: r.id, name: r.name }))
    .sort((a, b) => a.rank - b.rank);
}

async function getUserRole(userId, groupId) {
  const res = await axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
  const group = res.data.data.find(g => g.group.id === parseInt(groupId));
  return group ? { rank: group.role.rank, roleId: group.role.id, name: group.role.name } : null;
}

// ⭐ FIXED CLOUD API FUNCTION
async function setRoleApi(userId, roleId, groupId, apiKey) {
  const memberships = await axios.get(
    `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships?maxPageSize=100`,
    { headers: { "x-api-key": apiKey } }
  );

  const membership = memberships.data.groupMemberships.find(
    m => m.user.userId === userId
  );

  if (!membership) throw new Error("User not in group");

  await axios.patch(
    `https://apis.roblox.com/cloud/v2/${membership.name}`,
    {
      role: `groups/${groupId}/roles/${roleId}`
    },
    {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      }
    }
  );
}

async function getUserIdByName(username) {
  const res = await axios.post(
    "https://users.roblox.com/v1/usernames/users",
    { usernames: [username], excludeBannedUsers: false }
  );
  return res.data.data[0]?.id || null;
}

async function doRankAction(ws, userId, action, targetRank) {
  const ranks = ws.ranks;
  const current = await getUserRole(userId, ws.groupId);
  if (!current) throw new Error("User not in group");
  if (current.rank >= ws.protectedRank) throw new Error("User is protected");

  let newRole;

  if (action === "promote") {
    const idx = ranks.findIndex(r => r.rank === current.rank);
    if (idx === -1 || idx === ranks.length - 1) throw new Error("Can't promote further");
    newRole = ranks[idx + 1];
  }

  if (action === "demote") {
    const idx = ranks.findIndex(r => r.rank === current.rank);
    if (idx <= 0) throw new Error("Can't demote further");
    newRole = ranks[idx - 1];
  }

  if (action === "setrank") {
    newRole = ranks.find(r => r.rank === parseInt(targetRank));
    if (!newRole) throw new Error("Invalid rank");
  }

  await setRoleApi(userId, newRole.id, ws.groupId, ws.apiKey);
  return newRole;
}

// ── Workspace create ──────────────────────────────────────────
app.post("/api/workspaces", authMiddleware, async (req, res) => {
  const { name, groupId, apiKey } = req.body;

  try {
    const ranks = await fetchGroupRoles(groupId);

    const ws = await db.workspaces.insert({
      userId: req.user.id,
      name,
      groupId: parseInt(groupId),
      apiKey,
      protectedRank: 253,
      ranks,
      createdAt: new Date()
    });

    res.json({ success: true, id: ws._id });

  } catch {
    res.status(400).json({ error: "Invalid group or API key" });
  }
});

// ── Rank endpoint ─────────────────────────────────────────────
app.post("/api/ws/:id/rank", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.findOne({
    _id: req.params.id,
    userId: req.user.id
  });

  if (!ws) return res.status(404).json({ error: "Not found" });

  const { username, action, rank } = req.body;

  try {
    const userId = await getUserIdByName(username);
    if (!userId) return res.status(404).json({ error: "User not found" });

    const newRole = await doRankAction(ws, userId, action, rank);

    res.json({ success: true, newRank: newRole.name });

  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── In-game ranking ───────────────────────────────────────────
app.post("/api/game/:id/rank", async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id });
  if (!ws) return res.status(404).json({ error: "Workspace not found" });

  const { userId, action, rank } = req.body;

  try {
    const newRole = await doRankAction(ws, userId, action, rank);
    res.json({ success: true, newRank: newRole.name });

  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── SPA ───────────────────────────────────────────────────────
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(PORT, () =>
  console.log(`✅ RoTools running on http://localhost:${PORT}`)
);
