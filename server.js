const express = require("express");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "rotools-secret-change-in-production";

// ── Database ──────────────────────────────────────────────────
const db = new Database(process.env.DB_PATH || "./rotools.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    group_id INTEGER NOT NULL,
    api_key TEXT NOT NULL,
    protected_rank INTEGER DEFAULT 253,
    ranks TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS workspace_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'moderator',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  );

  CREATE TABLE IF NOT EXISTS rank_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    new_rank TEXT NOT NULL,
    by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  );

  CREATE TABLE IF NOT EXISTS whitelist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    roblox_user_id INTEGER NOT NULL,
    roblox_username TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  );
`);

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Auth middleware ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function wsAuthMiddleware(req, res, next) {
  const token = req.headers["x-ws-token"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.wsUser = jwt.verify(token, JWT_SECRET + "_ws");
    next();
  } catch {
    res.status(401).json({ error: "Invalid workspace token" });
  }
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

// ── Account routes ────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) return res.status(400).json({ error: "All fields required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const stmt = db.prepare("INSERT INTO users (email, username, password) VALUES (?, ?, ?)");
    const result = stmt.run(email.toLowerCase(), username, hash);
    const token = jwt.sign({ id: result.lastInsertRowid, username, email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, username });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(400).json({ error: "Email or username already taken" });
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email?.toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid email or password" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });
  const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token, username: user.username });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  const user = db.prepare("SELECT id, email, username, plan, created_at FROM users WHERE id = ?").get(req.user.id);
  res.json(user);
});

// ── Workspace routes ──────────────────────────────────────────
app.get("/api/workspaces", authMiddleware, (req, res) => {
  const workspaces = db.prepare("SELECT id, name, group_id, protected_rank, created_at FROM workspaces WHERE user_id = ?").all(req.user.id);
  res.json(workspaces);
});

app.post("/api/workspaces", authMiddleware, async (req, res) => {
  const { name, groupId, apiKey } = req.body;
  if (!name || !groupId || !apiKey) return res.status(400).json({ error: "All fields required" });
  const existing = db.prepare("SELECT COUNT(*) as c FROM workspaces WHERE user_id = ?").get(req.user.id);
  if (existing.c >= 3) return res.status(400).json({ error: "Free plan limited to 3 workspaces" });
  try {
    const ranks = await fetchGroupRoles(groupId);
    const stmt = db.prepare("INSERT INTO workspaces (user_id, name, group_id, api_key, ranks) VALUES (?, ?, ?, ?, ?)");
    const result = stmt.run(req.user.id, name, parseInt(groupId), apiKey, JSON.stringify(ranks));
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: "Invalid Group ID or couldn't fetch roles from Roblox" });
  }
});

app.delete("/api/workspaces/:id", authMiddleware, (req, res) => {
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!ws) return res.status(404).json({ error: "Not found" });
  db.prepare("DELETE FROM workspaces WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM workspace_users WHERE workspace_id = ?").run(req.params.id);
  db.prepare("DELETE FROM rank_log WHERE workspace_id = ?").run(req.params.id);
  db.prepare("DELETE FROM whitelist WHERE workspace_id = ?").run(req.params.id);
  res.json({ success: true });
});

app.get("/api/workspaces/:id/settings", authMiddleware, (req, res) => {
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!ws) return res.status(404).json({ error: "Not found" });
  res.json({ ...ws, api_key: "••••••••" + ws.api_key.slice(-4) });
});

app.patch("/api/workspaces/:id/settings", authMiddleware, async (req, res) => {
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!ws) return res.status(404).json({ error: "Not found" });
  const { name, groupId, apiKey, protectedRank } = req.body;
  let ranks = JSON.parse(ws.ranks);
  if (groupId && parseInt(groupId) !== ws.group_id) {
    try { ranks = await fetchGroupRoles(groupId); } catch { return res.status(400).json({ error: "Invalid Group ID" }); }
  }
  db.prepare("UPDATE workspaces SET name=?, group_id=?, api_key=?, protected_rank=?, ranks=? WHERE id=?")
    .run(name || ws.name, groupId ? parseInt(groupId) : ws.group_id, apiKey || ws.api_key, protectedRank || ws.protected_rank, JSON.stringify(ranks), req.params.id);
  res.json({ success: true });
});

// ── Workspace login (staff panel) ─────────────────────────────
app.post("/api/workspaces/:id/login", async (req, res) => {
  const { username, password } = req.body;
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(req.params.id);
  if (!ws) return res.status(404).json({ error: "Workspace not found" });

  // Check owner account too
  const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(ws.user_id);
  let role = null;
  if (owner.username === username) {
    const ok = await bcrypt.compare(password, owner.password);
    if (ok) role = "admin";
  }
  if (!role) {
    const wsUser = db.prepare("SELECT * FROM workspace_users WHERE workspace_id = ? AND username = ?").get(req.params.id, username);
    if (wsUser) {
      const ok = await bcrypt.compare(password, wsUser.password);
      if (ok) role = wsUser.role;
    }
  }
  if (!role) return res.status(401).json({ error: "Invalid username or password" });
  const token = jwt.sign({ workspaceId: parseInt(req.params.id), username, role }, JWT_SECRET + "_ws", { expiresIn: "12h" });
  res.json({ success: true, token, username, role });
});

// ── Workspace staff API ───────────────────────────────────────
function getWs(id) { return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id); }

app.get("/api/ws/:id/ranks", wsAuthMiddleware, (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id)) return res.status(403).json({ error: "Forbidden" });
  const ws = getWs(req.params.id);
  res.json(JSON.parse(ws.ranks));
});

app.get("/api/ws/:id/log", wsAuthMiddleware, (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id)) return res.status(403).json({ error: "Forbidden" });
  const log = db.prepare("SELECT * FROM rank_log WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100").all(req.params.id);
  res.json(log);
});

app.get("/api/ws/:id/whitelist", wsAuthMiddleware, (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id)) return res.status(403).json({ error: "Forbidden" });
  res.json(db.prepare("SELECT * FROM whitelist WHERE workspace_id = ?").all(req.params.id));
});

app.post("/api/ws/:id/whitelist/add", wsAuthMiddleware, async (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id)) return res.status(403).json({ error: "Forbidden" });
  const { username } = req.body;
  const userId = await getUserIdByName(username);
  if (!userId) return res.status(404).json({ error: "Roblox user not found" });
  const existing = db.prepare("SELECT id FROM whitelist WHERE workspace_id = ? AND roblox_user_id = ?").get(req.params.id, userId);
  if (!existing) db.prepare("INSERT INTO whitelist (workspace_id, roblox_user_id, roblox_username) VALUES (?,?,?)").run(req.params.id, userId, username);
  res.json({ success: true });
});

app.post("/api/ws/:id/whitelist/remove", wsAuthMiddleware, (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id)) return res.status(403).json({ error: "Forbidden" });
  db.prepare("DELETE FROM whitelist WHERE workspace_id = ? AND roblox_user_id = ?").run(req.params.id, req.body.userId);
  res.json({ success: true });
});

app.get("/api/ws/:id/staff", wsAuthMiddleware, (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id) || req.wsUser.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const users = db.prepare("SELECT id, username, role, created_at FROM workspace_users WHERE workspace_id = ?").all(req.params.id);
  res.json(users);
});

app.post("/api/ws/:id/staff/add", wsAuthMiddleware, async (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id) || req.wsUser.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  const hash = await bcrypt.hash(password, 10);
  db.prepare("INSERT INTO workspace_users (workspace_id, username, password, role) VALUES (?,?,?,?)").run(req.params.id, username, hash, role || "moderator");
  res.json({ success: true });
});

app.post("/api/ws/:id/staff/remove", wsAuthMiddleware, (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id) || req.wsUser.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  db.prepare("DELETE FROM workspace_users WHERE workspace_id = ? AND id = ?").run(req.params.id, req.body.id);
  res.json({ success: true });
});

app.get("/api/ws/:id/members", wsAuthMiddleware, async (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id)) return res.status(403).json({ error: "Forbidden" });
  try {
    const ws = getWs(req.params.id);
    const r = await axios.get(`https://groups.roblox.com/v1/groups/${ws.group_id}/users?limit=100&sortOrder=Asc`);
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ws/:id/rank", wsAuthMiddleware, async (req, res) => {
  if (req.wsUser.workspaceId !== parseInt(req.params.id)) return res.status(403).json({ error: "Forbidden" });
  const ws = getWs(req.params.id);
  const ranks = JSON.parse(ws.ranks);
  const { username, action, rank: targetRank } = req.body;
  try {
    const userId = await getUserIdByName(username);
    if (!userId) return res.status(404).json({ error: "Roblox user not found" });
    const current = await getUserRole(userId, ws.group_id);
    if (!current) return res.status(404).json({ error: "User not in group" });
    if (current.rank >= ws.protected_rank) return res.status(403).json({ error: "User is protected" });
    let newRole;
    if (action === "promote") {
      const idx = ranks.findIndex(r => r.rank === current.rank);
      if (idx === -1 || idx === ranks.length - 1) return res.status(400).json({ error: "Can't promote further" });
      newRole = ranks[idx + 1];
    } else if (action === "demote") {
      const idx = ranks.findIndex(r => r.rank === current.rank);
      if (idx <= 0) return res.status(400).json({ error: "Can't demote further" });
      newRole = ranks[idx - 1];
    } else if (action === "setrank") {
      newRole = ranks.find(r => r.rank === parseInt(targetRank));
      if (!newRole) return res.status(400).json({ error: "Invalid rank" });
      if (newRole.rank >= ws.protected_rank) return res.status(403).json({ error: "Can't set to protected rank" });
    } else {
      return res.status(400).json({ error: "Unknown action" });
    }
    await setRoleApi(userId, newRole.id, ws.group_id, ws.api_key);
    db.prepare("INSERT INTO rank_log (workspace_id, action, target, new_rank, by) VALUES (?,?,?,?,?)")
      .run(req.params.id, action === "promote" ? "Promoted" : action === "demote" ? "Demoted" : "Set Rank", username, newRole.name, req.wsUser.username);
    res.json({ success: true, newRank: newRole.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Roblox game endpoint (no auth, uses workspace id) ─────────
app.post("/api/game/:id/rank", async (req, res) => {
  const ws = getWs(req.params.id);
  if (!ws) return res.status(404).json({ error: "Workspace not found" });
  const { userId, action, rank: targetRank, by } = req.body;
  const ranks = JSON.parse(ws.ranks);
  try {
    const current = await getUserRole(userId, ws.group_id);
    if (!current) return res.status(404).json({ error: "User not in group" });
    if (current.rank >= ws.protected_rank) return res.status(403).json({ error: "User is protected" });
    let newRole;
    if (action === "promote") {
      const idx = ranks.findIndex(r => r.rank === current.rank);
      if (idx === -1 || idx === ranks.length - 1) return res.status(400).json({ error: "Can't promote further" });
      newRole = ranks[idx + 1];
    } else if (action === "demote") {
      const idx = ranks.findIndex(r => r.rank === current.rank);
      if (idx <= 0) return res.status(400).json({ error: "Can't demote further" });
      newRole = ranks[idx - 1];
    } else if (action === "setrank") {
      newRole = ranks.find(r => r.rank === parseInt(targetRank));
      if (!newRole) return res.status(400).json({ error: "Invalid rank" });
    } else {
      return res.status(400).json({ error: "Unknown action" });
    }
    await setRoleApi(userId, newRole.id, ws.group_id, ws.api_key);
    db.prepare("INSERT INTO rank_log (workspace_id, action, target, new_rank, by) VALUES (?,?,?,?,?)")
      .run(req.params.id, action === "promote" ? "Promoted" : action === "demote" ? "Demoted" : "Set Rank", by || userId.toString(), newRole.name, "In-Game");
    res.json({ success: true, newRank: newRole.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Catch-all → SPA ───────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`✅ RoTools running on http://localhost:${PORT}`));
