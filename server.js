// ── Roblox helpers ────────────────────────────────────────────

// Fetch group roles
async function fetchGroupRoles(groupId) {
  const res = await axios.get(`https://groups.roblox.com/v1/groups/${groupId}/roles`);
  return res.data.roles
    .filter(r => r.rank > 0 && r.rank < 255)
    .map(r => ({ rank: r.rank, id: r.id, name: r.name }))
    .sort((a, b) => a.rank - b.rank);
}

// Get user role in group
async function getUserRole(userId, groupId) {
  const res = await axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
  const group = res.data.data.find(g => g.group.id === parseInt(groupId));
  return group ? { rank: group.role.rank, roleId: group.role.id, name: group.role.name } : null;
}

// ✅ Fixed: Set user role via cloud API
async function setRoleApi(userId, roleId, groupId, apiKey) {
  try {
    await axios.patch(
      `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships/${userId}`,
      { roleId: roleId }, // numeric ID only
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`, // correct header for most cloud APIs
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.log("Promotion error:", err.response?.data || err.message);
    if (err.response?.status === 401) throw new Error("Unauthorized: Invalid API key");
    throw new Error(err.response?.data?.message || err.message);
  }
}

// Get username by ID
async function getUsernameById(userId) {
  try {
    const res = await axios.post("https://users.roblox.com/v1/users", { userIds: [userId], excludeBannedUsers: false });
    return res.data.data[0]?.name || "Unknown";
  } catch { return "Unknown"; }
}

// Get userId by username
async function getUserIdByName(username) {
  const res = await axios.post("https://users.roblox.com/v1/usernames/users", { usernames: [username], excludeBannedUsers: false });
  return res.data.data[0]?.id || null;
}

// ✅ Fixed: Rank actions (promote/demote/setrank)
async function doRankAction(ws, userId, action, targetRank) {
  const ranks = ws.ranks;
  const current = await getUserRole(userId, ws.groupId);
  if (!current) throw new Error("User not in group");
  if (current.rank >= ws.protectedRank) throw new Error("User is protected");

  let newRole;

  const idx = ranks.findIndex(r => r.rank === current.rank);
  if (idx === -1) throw new Error("Current rank not found");

  if (action === "promote") {
    if (idx === ranks.length - 1) throw new Error("Can't promote further");
    newRole = ranks[idx + 1];
  } else if (action === "demote") {
    if (idx === 0) throw new Error("Can't demote further");
    newRole = ranks[idx - 1];
  } else if (action === "setrank") {
    newRole = ranks.find(r => r.rank === parseInt(targetRank));
    if (!newRole) throw new Error("Invalid rank");
    if (newRole.rank >= ws.protectedRank) throw new Error("Can't set to protected rank");
  } else {
    throw new Error("Invalid action");
  }

  // Perform API request
  await setRoleApi(userId, newRole.id, ws.groupId, ws.apiKey);
  return newRole;
}
