const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* -----------------------------
   SIMPLE "DATABASE" (memory)
------------------------------*/
let conversations = {};

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
   SEND MESSAGE (USER)
------------------------------*/
app.post("/send-message", (req, res) => {
  const { name, message } = req.body;

  if (!name || !message) {
    return res.json({ success: false });
  }

  if (!conversations[name]) {
    conversations[name] = [];
  }

  conversations[name].push({
    sender: "user",
    message,
    time: Date.now()
  });

  console.log("💬 USER MESSAGE:", name, message);

  res.json({ success: true });
});

/* -----------------------------
   GET ALL CONVERSATIONS (ADMIN)
------------------------------*/
app.get("/conversations", (req, res) => {
  res.json(conversations);
});

/* -----------------------------
   REPLY FROM ADMIN
------------------------------*/
app.post("/reply", (req, res) => {
  const { name, message } = req.body;

  if (!conversations[name]) {
    return res.json({ success: false });
  }

  conversations[name].push({
    sender: "admin",
    message,
    time: Date.now()
  });

  console.log("📨 ADMIN REPLY:", name, message);

  res.json({ success: true });
});

/* -----------------------------
   START SERVER
------------------------------*/
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 Running on", PORT);
});
