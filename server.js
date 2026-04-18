const express = require("express");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* -----------------------------
   SIMPLE DATABASE (temporary)
------------------------------*/
let chats = {};
let quotes = [];

/* -----------------------------
   LOGIN (VERY BASIC - NOT SECURE)
   admin / paul
------------------------------*/
function checkLogin(req) {
  const { user, pass } = req.body;
  return user === "admin" && pass === "paul";
}

/* -----------------------------
   HOME PAGE
------------------------------*/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* -----------------------------
   ADMIN PAGE
------------------------------*/
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

/* -----------------------------
   SEND QUOTE
------------------------------*/
app.post("/send-quote", (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !phone || !message) {
    return res.json({ success: false });
  }

  quotes.push({
    name,
    email,
    phone,
    message,
    time: Date.now()
  });

  console.log("⚡ NEW QUOTE:", name);

  res.json({ success: true });
});

/* -----------------------------
   SEND CHAT MESSAGE
------------------------------*/
app.post("/send-message", (req, res) => {
  const { name, message } = req.body;

  if (!name || !message) {
    return res.json({ success: false });
  }

  if (!chats[name]) {
    chats[name] = [];
  }

  chats[name].push({
    sender: "user",
    message,
    time: Date.now()
  });

  console.log("💬 CHAT:", name, message);

  res.json({ success: true });
});

/* -----------------------------
   GET ALL DATA (ADMIN PANEL)
------------------------------*/
app.get("/data", (req, res) => {
  res.json({
    chats,
    quotes
  });
});

/* -----------------------------
   ADMIN REPLY
------------------------------*/
app.post("/reply", (req, res) => {
  const { name, message } = req.body;

  if (!chats[name]) {
    return res.json({ success: false });
  }

  chats[name].push({
    sender: "admin",
    message,
    time: Date.now()
  });

  console.log("📩 ADMIN REPLY:", name, message);

  res.json({ success: true });
});

/* -----------------------------
   LOGIN CHECK ENDPOINT (optional use)
------------------------------*/
app.post("/login", (req, res) => {
  const { user, pass } = req.body;

  if (user === "admin" && pass === "paul") {
    return res.json({ success: true });
  }

  res.json({ success: false });
});

/* -----------------------------
   START SERVER
------------------------------*/
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 SPS Electrical running on port", PORT);
});
