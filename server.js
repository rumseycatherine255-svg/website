const express = require("express");
const path = require("path");
const { Resend } = require("resend");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ---------------- EMAIL ---------------- */
const resend = new Resend(process.env.RESEND_API_KEY);

/* ---------------- STORAGE ---------------- */
let chats = {};
let quotes = [];

/* ---------------- ADMIN ---------------- */
const ADMIN_USER = "paul";
const ADMIN_PASS = "admin";

/* ---------------- LOGIN ---------------- */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ success: true, role: "admin" });
  }

  res.json({ success: false });
});

/* ---------------- QUOTES ---------------- */
app.post("/send-quote", async (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !phone || !message) {
    return res.json({ success: false });
  }

  quotes.push({ name, email, phone, message });

  try {
    await resend.emails.send({
      from: "SPS Electrical <onboarding@resend.dev>",
      to: process.env.EMAIL,
      subject: "New Quote Request",
      html: `
        <h2>New Quote</h2>
        <p>${name}</p>
        <p>${email}</p>
        <p>${phone}</p>
        <p>${message}</p>
      `
    });

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

/* ---------------- CHAT ---------------- */
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

/* ---------------- DATA ---------------- */
app.get("/data", (req, res) => {
  res.json({ chats, quotes });
});

/* ---------------- START ---------------- */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 Running on port", PORT);
});
