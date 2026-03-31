# RoTools 🚀

Roblox Group Ranking Panel — a full SaaS-style web app for managing Roblox group ranks.

## Project Structure

```
rotools/
├── server.js          ← Node.js backend (Express + SQLite)
├── package.json
├── railway.toml       ← Railway deployment config
├── .gitignore
└── public/
    └── index.html     ← Full frontend SPA (landing + auth + dashboard)
```

## Deploy to Railway

### Step 1 — Push to GitHub
1. Create a new repo on GitHub (e.g. `rotools`)
2. Open a terminal in this folder and run:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/rotools.git
git push -u origin main
```

### Step 2 — Deploy on Railway
1. Go to [railway.app](https://railway.app) and sign up/log in
2. Click **New Project → Deploy from GitHub repo**
3. Select your `rotools` repo
4. Railway will auto-detect Node.js and deploy it

### Step 3 — Set Environment Variables
In your Railway project, go to **Variables** and add:
```
JWT_SECRET=some-long-random-secret-string-change-this
PORT=3000
```

### Step 4 — Add your domain
1. In Railway, go to **Settings → Networking → Custom Domain**
2. Add `rotools.com` (or whatever domain you have)
3. Point your domain's DNS to Railway's provided values

---

## How it works for users

1. User signs up at rotools.com
2. Creates a **Workspace** (enters their Group ID + Roblox API key)
3. Gets a dashboard to promote/demote/setrank members
4. Adds staff accounts with their own logins
5. Uses the in-game Lua script with their Workspace ID for chat commands

## In-game Lua Script

For each workspace, users put this in **ServerScriptService**:
Replace `WORKSPACE_ID` with their workspace's ID number.

```lua
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local SERVER_URL = "https://rotools.com"
local WORKSPACE_ID = "1"  -- Replace with your workspace ID
local MIN_RANK = 247
local GROUP_ID = 36035309  -- Replace with your group ID

local notifyEvent = Instance.new("RemoteEvent")
notifyEvent.Name = "RankNotification"
notifyEvent.Parent = ReplicatedStorage

local function getPlayerByName(name)
    for _, p in ipairs(Players:GetPlayers()) do
        if p.Name:lower() == name:lower() then return p end
    end
    return nil
end

local function sendRequest(action, userId, rank)
    local body = { userId = userId, action = action, by = "In-Game" }
    if rank then body.rank = rank end
    local ok, result = pcall(function()
        return HttpService:RequestAsync({
            Url = SERVER_URL .. "/api/game/" .. WORKSPACE_ID .. "/rank",
            Method = "POST",
            Headers = { ["Content-Type"] = "application/json" },
            Body = HttpService:JSONEncode(body)
        })
    end)
    if ok then return HttpService:JSONDecode(result.Body) end
    return nil
end

Players.PlayerAdded:Connect(function(player)
    player.Chatted:Connect(function(message)
        if player:GetRankInGroup(GROUP_ID) < MIN_RANK then return end
        local args = message:split(" ")
        local cmd = args[1] and args[1]:lower()

        if cmd == "!promote" and args[2] then
            local target = getPlayerByName(args[2])
            if not target then return end
            local res = sendRequest("promote", target.UserId)
            if res and res.success then
                notifyEvent:FireClient(target, "Promoted!", "You are now " .. res.newRank)
            end
        elseif cmd == "!demote" and args[2] then
            local target = getPlayerByName(args[2])
            if not target then return end
            local res = sendRequest("demote", target.UserId)
            if res and res.success then
                notifyEvent:FireClient(target, "Demoted.", "You are now " .. res.newRank)
            end
        elseif cmd == "!setrank" and args[2] and args[3] then
            local target = getPlayerByName(args[2])
            if not target then return end
            local res = sendRequest("setrank", target.UserId, tonumber(args[3]))
            if res and res.success then
                notifyEvent:FireClient(target, "Rank Changed!", "You are now " .. res.newRank)
            end
        end
    end)
end)
```
