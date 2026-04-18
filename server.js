const express = require("express");
const cors = require("cors");
const path = require("path");
const { Resend } = require("resend");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const resend = new Resend(process.env.RESEND_API_KEY);

// homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ⚡ QUOTE FORM
app.post("/send-quote", async (req, res) => {
  const { name, email, phone, message } = req.body;

  console.log("⚡ QUOTE:", req.body);

  try {
    await resend.emails.send({
      from: "SPS Electrical <onboarding@resend.dev>",
      to: process.env.EMAIL,
      subject: "New Electrical Quote Request",
      html: `
        <h2>New Quote Request</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>Message:</b><br>${message}</p>
      `
    });

    res.json({ success: true });

  } catch (err) {
    console.log("QUOTE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});


// 💬 LIVE CHAT SYSTEM
app.post("/send-chat", async (req, res) => {
  const { name, message } = req.body;

  console.log("💬 CHAT:", req.body);

  if (!name || !message) {
    return res.json({ success: false, error: "Missing fields" });
  }

  try {
    await resend.emails.send({
      from: "SPS Chat <onboarding@resend.dev>",
      to: process.env.EMAIL,
      subject: `💬 New Chat Message from ${name}`,
      html: `
        <h2>New Website Chat</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Message:</b><br>${message}</p>
      `
    });

    res.json({ success: true });

  } catch (err) {
    console.log("CHAT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});


const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Running on", PORT);
});
