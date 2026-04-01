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
const JWT_SECRET = process.env.JWT_SECRET || "rotools-secret";

const db = {
  users: Datastore.create({ filename: "./data/users.db", autoload: true }),
  workspaces: Datastore.create({ filename: "./data/workspaces.db", autoload: true }),
  wsUsers: Datastore.create({ filename: "./data/wsusers.db", autoload: true }),
  log: Datastore.create({ filename: "./data/log.db", autoload: true }),
  whitelist: Datastore.create({ filename: "./data/whitelist.db", autoload: true }),
};

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function auth(req,res,next){
  const token = req.headers.authorization?.split(" ")[1];
  if(!token) return res.status(401).json({error:"Unauthorized"});
  try{
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  }catch{
    res.status(401).json({error:"Invalid token"});
  }
}

/* Roblox helpers */

async function fetchGroupRoles(groupId){
  const r = await axios.get(`https://groups.roblox.com/v1/groups/${groupId}/roles`);
  return r.data.roles
    .filter(x=>x.rank>0 && x.rank<255)
    .map(x=>({rank:x.rank,id:x.id,name:x.name}))
    .sort((a,b)=>a.rank-b.rank);
}

async function getUserId(username){
  const r = await axios.post(
    "https://users.roblox.com/v1/usernames/users",
    {usernames:[username],excludeBannedUsers:false}
  );
  return r.data.data[0]?.id;
}

async function getUserRole(userId,groupId){
  const r = await axios.get(
    `https://groups.roblox.com/v1/users/${userId}/groups/roles`
  );
  const g = r.data.data.find(x=>x.group.id==groupId);
  return g ? {rank:g.role.rank, roleId:g.role.id, name:g.role.name} : null;
}

async function setRole(userId,roleId,groupId,apiKey){
  const memberships = await axios.get(
    `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships?maxPageSize=100`,
    {headers:{"x-api-key":apiKey}}
  );

  const m = memberships.data.groupMemberships.find(
    x=>x.user.userId===userId
  );
  if(!m) throw new Error("User not in group");

  await axios.patch(
    `https://apis.roblox.com/cloud/v2/${m.name}`,
    {role:`groups/${groupId}/roles/${roleId}`},
    {headers:{
      "x-api-key":apiKey,
      "Content-Type":"application/json"
    }}
  );
}

/* auth */

app.post("/api/auth/register", async(req,res)=>{
  const {email,username,password}=req.body;

  const hash = await bcrypt.hash(password,10);
  const user = await db.users.insert({
    email:email.toLowerCase(),
    username,
    password:hash
  });

  const token = jwt.sign({id:user._id,username},JWT_SECRET,{expiresIn:"3650d"});
  res.json({success:true,token,username});
});

app.post("/api/auth/login", async(req,res)=>{
  const {email,password}=req.body;

  const user = await db.users.findOne({email:email.toLowerCase()});
  if(!user) return res.status(401).json({error:"Invalid"});

  const ok = await bcrypt.compare(password,user.password);
  if(!ok) return res.status(401).json({error:"Invalid"});

  const token = jwt.sign(
    {id:user._id,username:user.username},
    JWT_SECRET,
    {expiresIn:"3650d"}
  );

  res.json({success:true,token,username:user.username});
});

/* workspaces */

app.get("/api/workspaces",auth,async(req,res)=>{
  const ws = await db.workspaces.find({userId:req.user.id});
  res.json(ws.map(w=>({
    id:w._id,
    name:w.name,
    groupId:w.groupId,
    protectedRank:w.protectedRank
  })));
});

app.post("/api/workspaces",auth,async(req,res)=>{
  const {name,groupId,apiKey}=req.body;

  try{
    const ranks = await fetchGroupRoles(groupId);

    const ws = await db.workspaces.insert({
      userId:req.user.id,
      name,
      groupId:parseInt(groupId),
      apiKey,
      ranks,
      protectedRank:253
    });

    res.json({success:true,id:ws._id});

  }catch{
    res.status(400).json({error:"Invalid group"});
  }
});

/* ranks — LIVE FETCH */

app.get("/api/ws/:id/ranks",auth,async(req,res)=>{
  try{
    const ws = await db.workspaces.findOne({
      _id:req.params.id,
      userId:req.user.id
    });

    if(!ws) return res.status(404).json({error:"Not found"});

    const ranks = await fetchGroupRoles(ws.groupId);

    res.json(ranks);

  }catch(e){
    res.status(500).json({error:e.message});
  }
});

/* members */

app.get("/api/ws/:id/members",auth,async(req,res)=>{
  try{
    const ws = await db.workspaces.findOne({
      _id:req.params.id,
      userId:req.user.id
    });

    const r = await axios.get(
      `https://groups.roblox.com/v1/groups/${ws.groupId}/users?limit=100&sortOrder=Asc`
    );

    res.json(r.data);

  }catch(e){
    res.status(500).json({error:e.message});
  }
});

/* rank */

app.post("/api/ws/:id/rank",auth,async(req,res)=>{
  const ws = await db.workspaces.findOne({
    _id:req.params.id,
    userId:req.user.id
  });

  const {username,action,rank}=req.body;

  try{
    const userId = await getUserId(username);
    const current = await getUserRole(userId,ws.groupId);

    if(!current) throw new Error("User not in group");
    if(current.rank >= ws.protectedRank) throw new Error("Protected user");

    const ranks = await fetchGroupRoles(ws.groupId);
    const idx = ranks.findIndex(r=>r.rank===current.rank);

    let newRole;

    if(action==="promote") newRole = ranks[idx+1];
    if(action==="demote") newRole = ranks[idx-1];
    if(action==="setrank") newRole = ranks.find(r=>r.rank==rank);

    if(!newRole) throw new Error("Invalid rank");

    await setRole(userId,newRole.id,ws.groupId,ws.apiKey);

    res.json({success:true,newRank:newRole.name});

  }catch(e){
    res.status(400).json({error:e.message});
  }
});

/* fallback */

app.get("*",(req,res)=>{
  if(req.path.startsWith("/api")){
    return res.status(404).json({error:"API not found"});
  }
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(PORT,()=>console.log("Server running "+PORT));
