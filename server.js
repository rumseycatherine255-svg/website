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

/* ---------------- QUOTE ---------------- */
app.post("/send-quote", async (req, res) => {
  const { name, email, phone, address, message } = req.body;

  if (!name || !email || !phone || !address || !message) {
    return res.json({ success: false, error: "Missing fields" });
  }

  try {
    await resend.emails.send({
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

    console.log("EMAIL SENT");

    quotes.push({ name, email, phone, address, message });

    res.json({ success: true });

  } catch (err) {
    console.error("EMAIL FAILED:", err);
    res.json({ success: false, error: err.message });
  }
});

/* ---------------- CHAT + FAKE AI ---------------- */
app.post("/send-message", (req, res) => {
  const { name, message, ai } = req.body;

  if (!name || !message) {
    return res.json({ success: false, error: "Missing data" });
  }

  if (!chats[name]) chats[name] = [];

  // Save user message
  chats[name].push({
    sender: "user",
    message,
    time: Date.now()
  });

  // Fake AI reply (only if enabled)
  if (ai) {
    const msg = message.toLowerCase();
    let reply = "Thanks for your message. We’ll get back to you shortly.";

    if (msg.includes("price") || msg.includes("cost")) {
      reply = "Pricing depends on the job. Please request a quote above.";
    } 
    else if (msg.includes("socket")) {
      reply = "We can install or replace sockets 👍 Send a quote request.";
    }
    else if (msg.includes("rewire")) {
      reply = "We handle full rewires. Please send a quote request.";
    }
    else if (msg.includes("urgent")) {
      reply = "If urgent, include your phone number and we’ll prioritise it.";
    }
    else if (msg.includes("hello") || msg.includes("hi")) {
      reply = "Hi 👋 How can we help today?";
    }

    chats[name].push({
      sender: "AI",
      message: reply,
      time: Date.now()
    });
  }

  res.json({ success: true });
});

/* ---------------- DATA ---------------- */
app.get("/data", (req, res) => {
  res.json({ chats, quotes });
});

/* ---------------- SERVER ---------------- */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
