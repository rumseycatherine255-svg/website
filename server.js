const express = require("express");
const path = require("path");
const { Resend } = require("resend");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ---------------- RESEND EMAIL ---------------- */
const resend = new Resend(process.env.RESEND_API_KEY);

/* ---------------- IN-MEMORY STORAGE ---------------- */
let chats = {};
let quotes = [];

/* ---------------- ADMIN LOGIN ---------------- */
const ADMIN_USER = "paul";
const ADMIN_PASS = "admin";

/* ---------------- HOME ---------------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ---------------- LOGIN CHECK ---------------- */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ success: true, role: "admin" });
  }

  res.json({ success: false });
});

/* ---------------- QUOTES + EMAIL ---------------- */
app.post("/send-quote", async (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !phone || !message) {
    return res.json({ success: false, error: "Missing fields" });
  }

  quotes.push({ name, email, phone, message });

  try {
    await resend.emails.send({
      from: "SPS Electrical <onboarding@resend.dev>",
      to: process.env.EMAIL,
      subject: "⚡ New Quote Request",
      html: `
        <h2>New Quote</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>Message:</b> ${message}</p>
      `
    });

    console.log("📧 Quote email sent");
    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Email failed" });
  }
});

/* ---------------- CHAT SYSTEM ---------------- */
app.post("/send-message", (req, res) => {
  const { name, message } = req.body;

  if (!name || !message) {
    return res.json({ success: false });
  }

  if (!chats[name]) chats[name] = [];

  chats[name].push({
    sender: "user",
    message,
    time: Date.now()
  });

  console.log("💬 Chat:", name, message);

  res.json({ success: true });
});

/* ---------------- ADMIN REPLY ---------------- */
app.post("/reply", (req, res) => {
  const { name, message } = req.body;

  if (!chats[name]) return res.json({ success: false });

  chats[name].push({
    sender: "admin",
    message,
    time: Date.now()
  });

  res.json({ success: true });
});

/* ---------------- ADMIN DATA ---------------- */
app.get("/data", (req, res) => {
  res.json({ chats, quotes });
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 Running on port", PORT);
});
