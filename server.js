const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* -----------------------------
   SIMPLE STORAGE (messages + quotes)
------------------------------*/
let messages = {};
let quotes = [];

/* -----------------------------
   PAGES
------------------------------*/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

/* -----------------------------
   QUOTE SYSTEM
------------------------------*/
app.post("/send-quote", (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !phone || !message) {
    return res.json({ success: false });
  }

  quotes.push({ name, email, phone, message });

  console.log("⚡ QUOTE:", name);

  res.json({ success: true });
});

/* -----------------------------
   CHAT SYSTEM
------------------------------*/
app.post("/send-message", (req, res) => {
  const { name, message } = req.body;

  if (!messages[name]) messages[name] = [];

  messages[name].push({
    sender: "user",
    message,
    time: Date.now()
  });

  console.log("💬 MESSAGE:", name);

  res.json({ success: true });
});

/* -----------------------------
   GET DATA (ADMIN)
------------------------------*/
app.get("/data", (req, res) => {
  res.json({ messages, quotes });
});

/* -----------------------------
   ADMIN REPLY
------------------------------*/
app.post("/reply", (req, res) => {
  const { name, message } = req.body;

  if (!messages[name]) return res.json({ success: false });

  messages[name].push({
    sender: "admin",
    message,
    time: Date.now()
  });

  res.json({ success: true });
});

/* -----------------------------
   START
------------------------------*/
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 SPS Electrical running on", PORT);
});
