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

// ENV
const EMAIL = process.env.EMAIL;
const PASS = process.env.APP_PASSWORD;

// Gmail SMTP (WORKING VERSION)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL,
    pass: PASS
  }
});

// IMPORTANT: verify connection (helps debug Railway issues)
transporter.verify((error) => {
  if (error) {
    console.log("❌ SMTP FAILED:", error);
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
    await transporter.sendMail({
      from: `"SPS Electrical" <${EMAIL}>`,
      to: EMAIL,
      subject: "New Quote Request",
      text: `
Name: ${name}
Email: ${email}
Message: ${message}
      `
    });

    console.log("✅ Email sent");

    return res.json({ success: true });

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err);

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
