const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ENV CHECK (IMPORTANT)
const EMAIL = process.env.EMAIL;
const PASS = process.env.APP_PASSWORD;

console.log("EMAIL EXISTS:", !!EMAIL);
console.log("PASSWORD EXISTS:", !!PASS);

// FIXED TRANSPORT (IMPORTANT CHANGE: NOT service:'gmail')
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: EMAIL,
    pass: PASS
  }
});

// VERIFY CONNECTION ON START
transporter.verify((error, success) => {
  if (error) {
    console.log("❌ SMTP ERROR:", error);
  } else {
    console.log("✅ SMTP READY");
  }
});

app.get("/test", (req, res) => {
  res.send("Server working");
});

app.post("/send-quote", async (req, res) => {
  const { name, email, message } = req.body;

  console.log("📩 Incoming quote:", req.body);

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }

  try {
    const info = await transporter.sendMail({
      from: `"SPS Electrical" <${EMAIL}>`,
      to: EMAIL,
      subject: "New Quote Request",
      text: `
Name: ${name}
Email: ${email}
Message: ${message}
      `
    });

    console.log("✅ EMAIL SENT:", info.messageId);

    return res.json({ success: true });

  } catch (err) {
    console.error("❌ EMAIL FAILED FULL ERROR:");
    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Running on port", PORT);
});
