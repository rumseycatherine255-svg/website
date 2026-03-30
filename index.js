const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const API_KEY = "AHPVJ6AKtECaBwUbzymLZ4NDYuiwXlBSKB66EcsLpkg0JPDNZXlKaGJHY2lPaUpTVXpJMU5pSXNJbXRwWkNJNkluTnBaeTB5TURJeExUQTNMVEV6VkRFNE9qVXhPalE1V2lJc0luUjVjQ0k2SWtwWFZDSjkuZXlKaGRXUWlPaUpTYjJKc2IzaEpiblJsY201aGJDSXNJbWx6Y3lJNklrTnNiM1ZrUVhWMGFHVnVkR2xqWVhScGIyNVRaWEoyYVdObElpd2lZbUZ6WlVGd2FVdGxlU0k2SWtGSVVGWktOa0ZMZEVWRFlVSjNWV0o2ZVcxTVdqUk9SRmwxYVhkWWJFSlRTMEkyTmtWamMweHdhMmN3U2xCRVRpSXNJbTkzYm1WeVNXUWlPaUl6TmpBek5UTXdPU0lzSW1WNGNDSTZNVGMzTkRreE1UQXhOU3dpYVdGMElqb3hOemMwT1RBM05ERTFMQ0p1WW1ZaU9qRTNOelE1TURjME1UVjkuY0lzQ3hESUhkN254bXJXNGVxenRyT2xtOWxqU0dUbVpSU1hjakhFaDBhZXN5UnVaam15R05ZbjBoZWxqVEh6LXY0c1FGUUhTWEZmSUx2OGdqa2xTaGhOSXFVamJpVG8yNThIaDR4MHo0dDFKb3FuaEFKVWtyOVprUWc3aUs3Rjg2YnJkMHhXdDJzWG9DY2lqUzVqTG9XQkExRGdJZEZNZnkwZHZhOW9sTUZOSjNnaEFVWVd0Q3R6aFdDQVJuV2RKWVJlZUFvX0U3M1dWcHlYNnRhNThyUWNxWGFfNFZtbWoxUjFmV2VsWUFPTlgyOFNXZGVHUUdmNmhWSi1nRFAzZHFSdE9qaERHa0dpNUloWWNUZEs4U2tXU0VKeEYwUGdjc1E5NDlDREVjNVBJTjc3OVlYV2dLd3ZidEswYXNnQ05EV1RudElSdFNmX0syZHJQM3J2UDZ3"; // Replace with your Roblox API key
const GROUP_ID = 36035309;
const PROTECTED_RANK = 253; // Co-Owner and above are untouchable

// Your full rank order
const RANKS = [
   {"groupId":36035309,"roles":[{"id":381874151,"name":"Guest","description":"A non-community member.","rank":0,"memberCount":0,"color":0},{"id":12884901889,"name":"Member","description":"A regular community member.","rank":1,"memberCount":11,"isBase":true,"color":0},{"id":384662196,"name":"Trainee","description":"","rank":1,"memberCount":6,"color":0},{"id":381724136,"name":"☕ Rookie Barista","description":"","rank":2,"memberCount":0,"color":0},{"id":382084188,"name":"☕ Junior Barista","description":"","rank":3,"memberCount":0,"color":0},{"id":384718154,"name":"☕ Senior Barista","description":"","rank":4,"memberCount":0,"color":0},{"id":383064160,"name":"☕ Head Barista","description":"","rank":5,"memberCount":0,"color":0},{"id":383936165,"name":"💼 Cafe Supervisor","description":"","rank":25,"memberCount":0,"color":0},{"id":384750137,"name":"🛠️ Corporate","description":"","rank":50,"memberCount":1,"color":0},{"id":382332189,"name":"☕️ Head Corporate","description":"","rank":150,"memberCount":0,"color":0},{"id":383028153,"name":"👑 Community Manager","description":"","rank":200,"memberCount":1,"color":0},{"id":381364176,"name":"☕ Cafe Board","description":"A regular community member.","rank":253,"memberCount":1,"color":0},{"id":382224130,"name":"👑 Holder / Rankers","description":"A community administrator.","rank":254,"memberCount":2,"color":0},{"id":382986112,"name":"👑 Owner","description":"The community's owner.","rank":255,"memberCount":1,"color":0}]}
];

// Helper: get current rank of a user in the group
async function getUserRole(userId) {
    const res = await axios.get(
        `https://groups.roblox.com/v1/users/${userId}/groups/roles`
    );
    const group = res.data.data.find(g => g.group.id === GROUP_ID);
    return group ? { rank: group.role.rank, roleId: group.role.id } : null;
}

// Helper: set a user's role by role ID
async function setRole(userId, roleId) {
    await axios.patch(
        `https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/memberships/${userId}`,
        { roleId: `groups/${GROUP_ID}/roles/${roleId}` },
        { headers: { "x-api-key": API_KEY, "Content-Type": "application/json" } }
    );
}

// !promote
app.post("/promote", async (req, res) => {
    try {
        const { userId } = req.body;
        const current = await getUserRole(userId);

        if (!current) return res.status(404).json({ error: "User not in group" });
        if (current.rank >= PROTECTED_RANK) return res.status(403).json({ error: "User is protected" });

        const currentIndex = RANKS.findIndex(r => r.rank === current.rank);
        if (currentIndex === -1 || currentIndex === RANKS.length - 1)
            return res.status(400).json({ error: "Can't promote further" });

        const newRole = RANKS[currentIndex + 1];
        await setRole(userId, newRole.id);
        res.json({ success: true, newRank: newRole.name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// !demote
app.post("/demote", async (req, res) => {
    try {
        const { userId } = req.body;
        const current = await getUserRole(userId);

        if (!current) return res.status(404).json({ error: "User not in group" });
        if (current.rank >= PROTECTED_RANK) return res.status(403).json({ error: "User is protected" });

        const currentIndex = RANKS.findIndex(r => r.rank === current.rank);
        if (currentIndex <= 0)
            return res.status(400).json({ error: "Can't demote further" });

        const newRole = RANKS[currentIndex - 1];
        await setRole(userId, newRole.id);
        res.json({ success: true, newRank: newRole.name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// !setrank
app.post("/setrank", async (req, res) => {
    try {
        const { userId, rank } = req.body;
        const current = await getUserRole(userId);

        if (!current) return res.status(404).json({ error: "User not in group" });
        if (current.rank >= PROTECTED_RANK) return res.status(403).json({ error: "User is protected" });

        const targetRole = RANKS.find(r => r.rank === rank);
        if (!targetRole) return res.status(400).json({ error: "Invalid rank number" });
        if (targetRole.rank >= PROTECTED_RANK) return res.status(403).json({ error: "Can't setrank to a protected rank" });

        await setRole(userId, targetRole.id);
        res.json({ success: true, newRank: targetRole.name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(3000, () => console.log("Ranking server running on port 3000"));
