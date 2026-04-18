const express = require("express");
const bodyParser = require("body-parser");
const { Resend } = require("resend");

const app = express();

app.use(bodyParser.json());
app.use(express.static("public"));

/* IMPORTANT: API KEY */
const resend = new Resend("YOUR_RESEND_API_KEY");

/* =========================
   QUOTE EMAIL ROUTE (FIXED)
========================= */
app.post("/send-quote", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    console.log("QUOTE RECEIVED:", req.body);

    const result = await resend.emails.send({
      from: "SPS Electrical <onboarding@resend.dev>",
      to: "YOUR_EMAIL@gmail.com",
      subject: "New Quote Request - SPS Electrical",
      html: `
        <h2>New Quote Request</h2>
        <p><b>Name:</b> ${name || ""}</p>
        <p><b>Email:</b> ${email || ""}</p>
        <p><b>Phone:</b> ${phone || ""}</p>
        <p><b>Message:</b><br>${message || ""}</p>
      `
    });

    console.log("RESEND RESULT:", result);

    return res.json({ success: true });

  } catch (err) {
    console.log("RESEND ERROR:", err);

    return res.json({
      success: false,
      error: err.message
    });
  }
});

/* =========================
   LIVE CHAT (optional)
========================= */
let chats = {};

app.post("/send-message", (req, res) => {
  const { name, message } = req.body;

  if (!chats[name]) chats[name] = [];

  chats[name].push({ sender: name, message });

  res.json({ success: true });
});

/* =========================
   DATA FOR ADMIN
========================= */
app.get("/data", (req, res) => {
  res.json({ chats });
});

/* =========================
   START SERVER
========================= */
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
