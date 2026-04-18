const express = require("express");
const bodyParser = require("body-parser");
const { Resend } = require("resend");

const app = express();

/* ======================
   MIDDLEWARE
====================== */
app.use(bodyParser.json());
app.use(express.static("public"));

/* ======================
   RESEND SETUP
====================== */
const resend = new Resend("YOUR_RESEND_API_KEY");

/* ======================
   QUOTE EMAIL ROUTE
====================== */
app.post("/send-quote", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    await resend.emails.send({
      from: "SPS Electrical <onboarding@resend.dev>",
      to: "YOUR_EMAIL@gmail.com",
      subject: "New Electrical Quote Request",
      html: `
        <h2>New Quote Request</h2>

        <p><b>Name:</b> ${name || "Not provided"}</p>
        <p><b>Email:</b> ${email || "Not provided"}</p>
        <p><b>Phone:</b> ${phone || "Not provided"}</p>

        <hr>

        <p><b>Message:</b></p>
        <p>${message || "No message provided"}</p>
      `
    });

    return res.json({ success: true });

  } catch (err) {
    console.log("Quote Email Error:", err);
    return res.json({ success: false, error: "Email failed to send" });
  }
});

/* ======================
   LIVE CHAT ENDPOINT
   (stores in memory - upgrade later if needed)
====================== */
let chats = {};

app.post("/send-message", (req, res) => {
  const { name, message } = req.body;

  if (!name || !message) {
    return res.json({ success: false });
  }

  if (!chats[name]) chats[name] = [];

  chats[name].push({
    sender: name,
    message
  });

  return res.json({ success: true });
});

/* ======================
   GET DATA FOR ADMIN PANEL
====================== */
app.get("/data", (req, res) => {
  res.json({
    chats
  });
});

/* ======================
   AI ENDPOINT (OPTIONAL)
   (simple fallback AI so frontend doesn't break)
====================== */
app.post("/ai", (req, res) => {
  const msg = (req.body.message || "").toLowerCase();

  let reply = "I’m not fully sure — could you explain a bit more?";

  if (msg.includes("light")) {
    reply = "LED lighting is usually the best option for efficiency and lifespan.";
  }

  if (msg.includes("socket")) {
    reply = "Double sockets or USB sockets are standard modern upgrades.";
  }

  if (msg.includes("tripping")) {
    reply = "Tripping usually means a fault or overload — it should be tested properly.";
  }

  if (msg.includes("flicker")) {
    reply = "Flickering lights often come from loose connections or circuit issues.";
  }

  if (msg.includes("hello") || msg.includes("hi")) {
    reply = "Hi — how can I help with your electrical issue?";
  }

  return res.json({ reply });
});

/* ======================
   START SERVER
====================== */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
