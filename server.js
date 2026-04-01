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

function wsAuthMiddleware(req, res, next) {
  const token = req.headers["x-ws-token"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { req.wsUser = jwt.verify(token, JWT_SECRET + "_ws"); next(); }
  catch { res.status(401).json({ error: "Invalid workspace token" }); }
}

function wsOwner(req, res, next) {
  if (req.wsUser.workspaceId !== req.params.id) return res.status(403).json({ error: "Forbidden" });
  next();
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

async function setRoleApi(userId, roleId, groupId, apiKey) {
  await axios.patch(
    `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships/${userId}`,
    { roleId: `groups/${groupId}/roles/${roleId}` },
    { headers: { "x-api-key": apiKey, "Content-Type": "application/json" } }
  );
}

async function getUsernameById(userId) {
  try {
    const res = await axios.post("https://users.roblox.com/v1/users", { userIds: [userId], excludeBannedUsers: false });
    return res.data.data[0]?.name || "Unknown";
  } catch { return "Unknown"; }
}

async function getUserIdByName(username) {
  const res = await axios.post("https://users.roblox.com/v1/usernames/users", { usernames: [username], excludeBannedUsers: false });
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
  } else if (action === "demote") {
    const idx = ranks.findIndex(r => r.rank === current.rank);
    if (idx <= 0) throw new Error("Can't demote further");
    newRole = ranks[idx - 1];
  } else if (action === "setrank") {
    newRole = ranks.find(r => r.rank === parseInt(targetRank));
    if (!newRole) throw new Error("Invalid rank");
    if (newRole.rank >= ws.protectedRank) throw new Error("Can't set to protected rank");
  }
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
  res.json(workspaces.map(w => ({ id: w._id, name: w.name, groupId: w.groupId, protectedRank: w.protectedRank, createdAt: w.createdAt })));
});

app.post("/api/workspaces", authMiddleware, async (req, res) => {
  const { name, groupId, apiKey } = req.body;
  if (!name || !groupId || !apiKey) return res.status(400).json({ error: "All fields required" });
  const count = await db.workspaces.count({ userId: req.user.id });
  if (count >= 3) return res.status(400).json({ error: "Free plan limited to 3 workspaces" });
  try {
    const ranks = await fetchGroupRoles(groupId);
    const ws = await db.workspaces.insert({ userId: req.user.id, name, groupId: parseInt(groupId), apiKey, protectedRank: 253, ranks, createdAt: new Date() });
    res.json({ success: true, id: ws._id });
  } catch { res.status(400).json({ error: "Invalid Group ID or couldn't fetch roles from Roblox" }); }
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
  res.json({ ...ws, apiKey: "••••" + ws.apiKey.slice(-4), id: ws._id });
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

// ── Workspace login ───────────────────────────────────────────
app.post("/api/workspaces/:id/login", async (req, res) => {
  const { username, password } = req.body;
  const ws = await db.workspaces.findOne({ _id: req.params.id });
  if (!ws) return res.status(404).json({ error: "Workspace not found" });
  const owner = await db.users.findOne({ _id: ws.userId });
  let role = null;
  if (owner && owner.username === username) {
    const ok = await bcrypt.compare(password, owner.password);
    if (ok) role = "admin";
  }
  if (!role) {
    const wsUser = await db.wsUsers.findOne({ workspaceId: req.params.id, username });
    if (wsUser) {
      const ok = await bcrypt.compare(password, wsUser.password);
      if (ok) role = wsUser.role;
    }
  }
  if (!role) return res.status(401).json({ error: "Invalid username or password" });
  const token = jwt.sign({ workspaceId: req.params.id, username, role }, JWT_SECRET + "_ws", { expiresIn: "12h" });
  res.json({ success: true, token, username, role });
});

// ── Workspace staff API ───────────────────────────────────────
app.get("/api/ws/:id/ranks", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ws) return res.status(404).json({ error: "Not found" });
  res.json(ws.ranks);
});

app.get("/api/ws/:id/log", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ws) return res.status(404).json({ error: "Not found" });
  const logs = await db.log.find({ workspaceId: req.params.id }).sort({ createdAt: -1 }).limit(100);
  res.json(logs);
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
    const ws = await db.workspaces.findOne({ _id: req.params.id, userId: req.user.id });
    if (!ws) return res.status(404).json({ error: "Not found" });
    const r = await axios.get(`https://groups.roblox.com/v1/groups/${ws.groupId}/users?limit=100&sortOrder=Asc`);
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ws/:id/rank", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ws) return res.status(404).json({ error: "Not found" });
  const { username, action, rank } = req.body;
  try {
    const userId = await getUserIdByName(username);
    if (!userId) return res.status(404).json({ error: "Roblox user not found" });
    const newRole = await doRankAction(ws, userId, action, rank);
    await db.log.insert({ workspaceId: req.params.id, action: action === "promote" ? "Promoted" : action === "demote" ? "Demoted" : "Set Rank", target: username, new_rank: newRole.name, by: req.user.username, createdAt: new Date() });
    res.json({ success: true, newRank: newRole.name });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── In-game endpoint ──────────────────────────────────────────
app.post("/api/game/:id/rank", async (req, res) => {
  const ws = await db.workspaces.findOne({ _id: req.params.id });
  if (!ws) return res.status(404).json({ error: "Workspace not found" });
  const { userId, action, rank, by } = req.body;
  try {
    const newRole = await doRankAction(ws, userId, action, rank);
    const username = await getUsernameById(userId);
    await db.log.insert({ workspaceId: req.params.id, action: action === "promote" ? "Promoted" : action === "demote" ? "Demoted" : "Set Rank", target: username, new_rank: newRole.name, by: by || "In-Game", createdAt: new Date() });
    res.json({ success: true, newRank: newRole.name });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Catch-all → SPA ───────────────────────────────────────────
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`✅ RoTools running on http://localhost:${PORT}`));
