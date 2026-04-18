const express = require("express");
const path = require("path");
const { Resend } = require("resend");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* EMAIL SETUP */
const resend = new Resend(process.env.RESEND_API_KEY);

/* STORAGE */
let chats = {};
let quotes = [];

/* ---------------- QUOTE (FIXED) ---------------- */
app.post("/send-quote", async (req, res) => {
  const { name, email, phone, address, message } = req.body;

  if (!name || !email || !phone || !address || !message) {
    return res.json({ success: false, error: "Missing fields" });
  }

  try {
    const response = await resend.emails.send({
      from: "SPS <onboarding@resend.dev>",
      to: process.env.EMAIL || "YOUR_EMAIL@gmail.com",
      subject: "⚡ NEW QUOTE REQUEST",
      html: `
        <h2>New Quote Request</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>Address:</b> ${address}</p>
        <p><b>Message:</b> ${message}</p>
      `
    });

    console.log("EMAIL SENT:", response);

    quotes.push({ name, email, phone, address, message });

    res.json({ success: true });

  } catch (err) {
    console.error("EMAIL FAILED:", err);

    res.json({
      success: false,
      error: err.message
    });
  }
});

/* ---------------- CHAT ---------------- */
app.post("/send-message", (req, res) => {
  const { name, message } = req.body;

  if (!name || !message) {
    return res.json({ success: false, error: "Missing data" });
  }

  if (!chats[name]) chats[name] = [];

  chats[name].push({
    sender: "user",
    message,
    time: Date.now()
  });

  res.json({ success: true });
});

/* ---------------- DATA ---------------- */
app.get("/data", (req, res) => {
  res.json({ chats, quotes });
});

/* ---------------- SERVER ---------------- */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 Running on port", PORT);
});
