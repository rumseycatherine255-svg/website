const express = require("express");
const cors = require("cors");
const path = require("path");
const { Resend } = require("resend");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ENV
const EMAIL = process.env.EMAIL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const resend = new Resend(RESEND_API_KEY);

// TEST ROUTE
app.get("/test", (req, res) => {
  res.send("Server working");
});

// QUOTE ROUTE
app.post("/send-quote", async (req, res) => {
  const { name, email, message } = req.body;

  console.log("📩 Incoming quote:", req.body);

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }

  try {
    await resend.emails.send({
      from: "SPS Electrical <onboarding@resend.dev>",
      to: EMAIL,
      subject: "New SPS Electrical Quote Request",
      html: `
        <h2>New Quote Request</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Message:</b> ${message}</p>
      `
    });

    console.log("✅ Email sent");

    return res.json({ success: true });

  } catch (err) {
    console.error("❌ Email error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Running on port", PORT);
});
