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

/* ================= DATABASE ================= */

const db = {
  users: Datastore.create({ filename: "./data/users.db", autoload: true }),
  workspaces: Datastore.create({ filename: "./data/workspaces.db", autoload: true }),
  wsUsers: Datastore.create({ filename: "./data/wsusers.db", autoload: true }),
  log: Datastore.create({ filename: "./data/log.db", autoload: true }),
  whitelist: Datastore.create({ filename: "./data/whitelist.db", autoload: true }),
};

/* ================= MIDDLEWARE ================= */

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ================= AUTH ================= */

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

/* ================= ROBLOX HELPERS ================= */

async function fetchGroupRoles(groupId) {
  const r = await axios.get(`https://groups.roblox.com/v1/groups/${groupId}/roles`);
  return r.data.roles
    .filter(x => x.rank > 0 && x.rank < 255)
    .map(x => ({ rank: x.rank, id: x.id, name: x.name }))
    .sort((a, b) => a.rank - b.rank);
}

async function getUserIdByName(username) {
  const r = await axios.post(
    "https://users.roblox.com/v1/usernames/users",
    { usernames: [username], excludeBannedUsers: false }
  );
  return r.data.data[0]?.id || null;
}

async function getUserRole(userId, groupId) {
  const r = await axios.get(
    `https://groups.roblox.com/v1/users/${userId}/groups/roles`
  );
  const g = r.data.data.find(x => x.group.id === parseInt(groupId));
  return g
    ? { rank: g.role.rank, roleId: g.role.id, name: g.role.name }
    : null;
}

/* ===== FIXED PROMOTION FUNCTION ===== */

async function setRoleApi(userId, roleId, groupId, apiKey) {
  const memberships = await axios.get(
    `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships?maxPageSize=100`,
    { headers: { "x-api-key": apiKey } }
  );

  const member = memberships.data.groupMemberships.find(
    m => m.user.userId === userId
  );

  if (!member) throw new Error("User not in group");

  await axios.patch(
    `https://apis.roblox.com/cloud/v2/${member.name}`,
    { role: `groups/${groupId}/roles/${roleId}` },
    {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      }
    }
  );
}

async function doRankAction(ws, userId, action, targetRank) {
  const ranks = ws.ranks;
  const current = await getUserRole(userId, ws.groupId);

  if (!current) throw new Error("User not in group");
  if (current.rank >= ws.protectedRank)
    throw new Error("User is protected");

  let newRole;

  if (action === "promote") {
    const idx = ranks.findIndex(r => r.rank === current.rank);
    if (idx === -1 || idx === ranks.length - 1)
      throw new Error("Can't promote further");
    newRole = ranks[idx + 1];
  }

  if (action === "demote") {
    const idx = ranks.findIndex(r => r.rank === current.rank);
    if (idx <= 0)
      throw new Error("Can't demote further");
    newRole = ranks[idx - 1];
  }

  if (action === "setrank") {
    newRole = ranks.find(r => r.rank === parseInt(targetRank));
    if (!newRole) throw new Error("Invalid rank");
    if (newRole.rank >= ws.protectedRank)
      throw new Error("Can't set protected rank");
  }

  await setRoleApi(userId, newRole.id, ws.groupId, ws.apiKey);
  return newRole;
}

/* ================= AUTH ROUTES ================= */

app.post("/api/auth/register", async (req, res) => {
  const { email, username, password } = req.body;

  const hash = await bcrypt.hash(password, 10);
  const user = await db.users.insert({
    email: email.toLowerCase(),
    username,
    password: hash
  });

  const token = jwt.sign(
    { id: user._id, username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ success: true, token, username });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await db.users.findOne({
    email: email.toLowerCase()
  });

  if (!user) return res.status(401).json({ error: "Invalid" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid" });

  const token = jwt.sign(
    { id: user._id, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ success: true, token, username: user.username });
});

/* ================= WORKSPACES ================= */

app.get("/api/workspaces", authMiddleware, async (req, res) => {
  const ws = await db.workspaces.find({ userId: req.user.id });
  res.json(ws);
});

app.post("/api/workspaces", authMiddleware, async (req, res) => {
  const { name, groupId, apiKey } = req.body;

  try {
    const ranks = await fetchGroupRoles(groupId);

    const ws = await db.workspaces.insert({
      userId: req.user.id,
      name,
      groupId: parseInt(groupId),
      apiKey,
      ranks,
      protectedRank: 253,
      createdAt: new Date()
    });

    res.json({ success: true, id: ws._id });

  } catch {
    res.status(400).json({ error: "Invalid group" });
  }
});

/* ================= MEMBERS ================= */

app.get("/api/ws/:id/members", authMiddleware, async (req, res) => {
  try {
    const ws = await db.workspaces.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    const r = await axios.get(
      `https://groups.roblox.com/v1/groups/${ws.groupId}/users?limit=100&sortOrder=Asc`
    );

    res.json(r.data);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ================= RANK ================= */

app.post("/api/ws/:id/rank", authMiddleware, async (req, res) => {
  try {
    const ws = await db.workspaces.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    const { username, action, rank } = req.body;

    const userId = await getUserIdByName(username);
    if (!userId) throw new Error("User not found");

    const newRole = await doRankAction(ws, userId, action, rank);

    await db.log.insert({
      workspaceId: ws._id,
      username,
      action,
      newRank: newRole.name,
      time: new Date()
    });

    res.json({
      success: true,
      newRank: newRole.name
    });

  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ================= FALLBACK ================= */

app.get("*", (req, res) => {
  if (req.path.startsWith("/api"))
    return res.status(404).json({ error: "API not found" });

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () =>
  console.log("Server running on " + PORT)
);
