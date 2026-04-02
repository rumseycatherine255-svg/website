const express = require("express");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const Datastore = require("nedb-promises");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "rotools-secret-change-in-production";

// ── Database ──────────────────────────────────────────────────
if (!fs.existsSync("./data")) fs.mkdirSync("./data");

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
    .map(r => ({ rank: parseInt(r.rank), id: parseInt(r.id), name: r.name }))
    .sort((a, b) => a.rank - b.rank);
}

async function getUserRole(userId, groupId) {
  const res = await axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
  const group = res.data.data.find(g => g.group.id === parseInt(groupId));
  return group ? { rank: parseInt(group.role.rank), roleId: parseInt(group.role.id), name: group.role.name } : null;
}

async function setRoleApi(userId, roleId, groupId, apiKey) {
  const url = `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships/${userId}`;
  const body = { roleId: `groups/${groupId}/roles/${roleId}` };
  console.log("Setting role:", url, body);
  const res = await axios.patch(url, body, {
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" }
  });
  console.log("Roblox response:", res.status, res.data);
  return res.data;
}

async function getUsernameById(userId) {
  try {
    const res = await axios.post("https://users.roblox.com/v1/users", { userIds: [parseInt(userId)], excludeBannedUsers: false });
    return res.data.data[0]?.name || "Unknown";
  } catch { return "Unknown"; }
}

async function getUserIdByName(username) {
  try {
    const res = await axios.post("https://users.roblox.com/v1/usernames/users", { usernames: [username], excludeBannedUsers: false });
    return res.data.data[0]?.id || null;
  } catch { return null; }
}

async function doRankAction(ws, userId, action, targetRank) {
  const ranks = ws.ranks;
  if (!ranks || ranks.length === 0) throw new Error("No ranks found in workspace — please re-save your workspace settings");

  console.log("doRankAction:", { userId, action, targetRank, groupId: ws.groupId, ranksCount: ranks.length });

  const current = await getUserRole(userId, ws.groupId);
  console.log("Current role:", current);

  if (!current) throw new Error("User is not in the group");
  if (current.rank >= parseInt(ws.protectedRank)) throw new Error("User is protected and cannot be ranked");

  let newRole;

  if (action === "promote") {
    const idx = ranks.findIndex(r => parseInt(r.rank) === parseInt(current.rank));
    console.log("Promote: current rank index:", idx, "of", ranks.length);
    if (idx === -1) throw new Error(`Current rank (${current.rank}) not found in rank list`);
    if (idx >= ranks.length - 1) throw new Error("User is already at the highest rank");
    newRole = ranks[idx + 1];

  } else if (action === "demote") {
    const idx = ranks.findIndex(r => parseInt(r.rank) === parseInt(current.rank));
    console.log("Demote: current rank index:", idx);
    if (idx === -1) throw new Error(`Current rank (${current.rank}) not found in rank list`);
    if (idx <= 0) throw new Error("User is already at the lowest rank");
    newRole = ranks[idx - 1];

  } else if (action === "setrank") {
    newRole = ranks.find(r => parseInt(r.rank) === parseInt(targetRank));
    console.log("Setrank: target rank:", targetRank, "found:", newRole);
    if (!newRole) throw new Error(`Rank ${targetRank} not found in rank list`);
    if (parseInt(newRole.rank) >= parseInt(ws.protectedRank)) throw new Error("Cannot set to a protected rank");

  } else {
    throw new Error("Unknown action: " + action);
  }

  console.log("New role:", newRole);
  await setRoleApi(userId, newRole.id, ws.groupId, ws.apiKey);
  return newRole;
}

// ── Auth routes ───────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) return res.status(400).json({ error: "All fields required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  try {
    const existing = await db.users.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
    if (existing) return res.status(400).json({ error: "Email or username already taken" });
    const hash = await bcrypt.hash(password, 10);
    const user = await db.users.insert({ email: email.toLowerCase(), username, password: hash, plan: "free", createdAt: new Date() });
    const token = jwt.sign({ id: user._id, username, email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.users.findOne({ email: email?.toLowerCase() });
  if (!user) return res.status(401).json({ error: "Invalid email or password" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });
  const token = jwt.sign({ id: user._id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token, username: user.username });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const user = await db.users.findOne({ _id: req.user.id });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ id: user._id, email: user.email, username: user.username, plan: user.plan });
});

// ── Workspace routes ──────────────────────────────────────────
app.get("/api/workspaces", authMiddleware, async (req, res) => {
  const workspaces = await db.workspaces.find({ userId: req.user.id });
  res.json(workspaces.map(w => ({
    id: w._id, name: w.name, groupId: w.groupId,
    protectedRank: w.protectedRank, ranks: w.ranks, createdAt: w.createdAt
  })));
});

app.post("/api/workspaces", authMiddleware, async (req, res) => {
  const { name, groupId, apiKey } = req.body;
  if (!name || !groupId || !apiKey) return res.status(400).json({ error: "All fields required" });
  const count = await db.workspaces.count({ userId: req.user.id });
  if (count >= 3) return res.status(400).json({ error: "Free plan limited to 3 workspaces" });
  try {
    const ranks = await fetchGroupRoles(groupId);
    const ws = await db.workspaces.insert({
      userId: req.user.id, name,
      groupId: parseInt(groupId), apiKey,
      protectedRank: 253, ranks, createdAt: new Date()
    });
    res.json({ success: true, id: ws._id });
  } catch (e) {
    console.error("Create workspace error:", e.message);
    res.status(400).json({ error: "Invalid Group ID or couldn't fetch roles from Roblox" });
  }
});

app.delete("/api/workspaces/:id", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ws) return res.status(404).json({ error: "Not found" });
  await db.workspaces.remove({ _id: req.params.id });
  await db.wsUsers.remove({ workspaceId: req.params.id }, { multi: true });
  await db.log.remove({ workspaceId: req.params.id }, { multi: true });
  await db.whitelist.remove({ workspaceId: req.params.id }, { multi: true });
  res.json({ success: true });
});

app.get("/api/workspaces/:id/settings", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ws) return res.status(404).json({ error: "Not found" });
  res.json({
    id: ws._id, name: ws.name, groupId: ws.groupId,
    protectedRank: ws.protectedRank, ranks: ws.ranks,
    apiKey: "••••" + ws.apiKey.slice(-4)
  });
});

app.patch("/api/workspaces/:id/settings", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ws) return res.status(404).json({ error: "Not found" });
  const { name, groupId, apiKey, protectedRank } = req.body;
  const update = {};
  if (name) update.name = name;
  if (apiKey) update.apiKey = apiKey;
  if (protectedRank) update.protectedRank = parseInt(protectedRank);
  if (groupId && parseInt(groupId) !== ws.groupId) {
    try { update.ranks = await fetchGroupRoles(groupId); update.groupId = parseInt(groupId); }
    catch { return res.status(400).json({ error: "Invalid Group ID" }); }
  }
  await db.workspaces.update({ _id: req.params.id }, { $set: update });
  res.json({ success: true });
});

// ── Workspace API ─────────────────────────────────────────────
app.get("/api/ws/:id/ranks", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id });
  if (!ws) return res.status(404).json({ error: "Not found" });
  res.json(ws.ranks);
});

app.get("/api/ws/:id/log", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id });
  if (!ws) return res.status(404).json({ error: "Not found" });
  const logs = await db.log.find({ workspaceId: req.params.id });
  logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(logs.slice(0, 100));
});

app.get("/api/ws/:id/whitelist", authMiddleware, async (req, res) => {
  const list = await db.whitelist.find({ workspaceId: req.params.id });
  res.json(list);
});

app.post("/api/ws/:id/whitelist/add", authMiddleware, async (req, res) => {
  const { username } = req.body;
  const userId = await getUserIdByName(username);
  if (!userId) return res.status(404).json({ error: "Roblox user not found" });
  const existing = await db.whitelist.findOne({ workspaceId: req.params.id, robloxUserId: userId });
  if (!existing) await db.whitelist.insert({ workspaceId: req.params.id, robloxUserId: userId, robloxUsername: username });
  res.json({ success: true });
});

app.post("/api/ws/:id/whitelist/remove", authMiddleware, async (req, res) => {
  await db.whitelist.remove({ workspaceId: req.params.id, robloxUserId: req.body.userId }, { multi: true });
  res.json({ success: true });
});

app.get("/api/ws/:id/staff", authMiddleware, async (req, res) => {
  const staff = await db.wsUsers.find({ workspaceId: req.params.id });
  res.json(staff.map(u => ({ id: u._id, username: u.username, role: u.role, createdAt: u.createdAt })));
});

app.post("/api/ws/:id/staff/add", authMiddleware, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  const hash = await bcrypt.hash(password, 10);
  await db.wsUsers.insert({ workspaceId: req.params.id, username, password: hash, role: role || "moderator", createdAt: new Date() });
  res.json({ success: true });
});

app.post("/api/ws/:id/staff/remove", authMiddleware, async (req, res) => {
  await db.wsUsers.remove({ _id: req.body.id, workspaceId: req.params.id });
  res.json({ success: true });
});

app.get("/api/ws/:id/members", authMiddleware, async (req, res) => {
  try {
    const ws = await db.workspaces.findOne({ _id: req.params.id });
    if (!ws) return res.status(404).json({ error: "Not found" });
    const r = await axios.get(`https://groups.roblox.com/v1/groups/${ws.groupId}/users?limit=100&sortOrder=Asc`);
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ws/:id/rank", authMiddleware, async (req, res) => {
  try {
    const ws = await db.workspaces.findOne({ _id: req.params.id });
    if (!ws) return res.status(404).json({ error: "Workspace not found" });
    const { username, action, rank } = req.body;
    if (!username || !action) return res.status(400).json({ error: "Missing username or action" });
    const userId = await getUserIdByName(username);
    if (!userId) return res.status(404).json({ error: "Roblox user not found: " + username });
    const newRole = await doRankAction(ws, userId, action, rank);
    await db.log.insert({
      workspaceId: req.params.id,
      action: action === "promote" ? "Promoted" : action === "demote" ? "Demoted" : "Set Rank",
      target: username,
      new_rank: newRole.name,
      by: req.user.username,
      createdAt: new Date()
    });
    res.json({ success: true, newRank: newRole.name });
  } catch (e) {
    console.error("Rank error:", e.message);
    res.status(400).json({ error: e.message });
  }
});

// ── In-game endpoint ──────────────────────────────────────────
app.post("/api/game/:id/rank", async (req, res) => {
  try {
    const ws = await db.workspaces.findOne({ _id: req.params.id });
    if (!ws) return res.status(404).json({ error: "Workspace not found" });
    const { userId, action, rank, by } = req.body;
    if (!userId || !action) return res.status(400).json({ error: "Missing userId or action" });
    const newRole = await doRankAction(ws, parseInt(userId), action, rank);
    const username = await getUsernameById(userId);
    await db.log.insert({
      workspaceId: req.params.id,
      action: action === "promote" ? "Promoted" : action === "demote" ? "Demoted" : "Set Rank",
      target: username,
      new_rank: newRole.name,
      by: by || "In-Game",
      createdAt: new Date()
    });
    res.json({ success: true, newRank: newRole.name });
  } catch (e) {
    console.error("Game rank error:", e.message);
    res.status(400).json({ error: e.message });
  }
});

// ── Catch-all → SPA ───────────────────────────────────────────
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`✅ RoTools running on http://localhost:${PORT}`));
