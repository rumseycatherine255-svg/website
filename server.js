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
const BREVO_USER = process.env.BREVO_USER;
const BREVO_PASS = process.env.BREVO_PASS;

// DEBUG (IMPORTANT)
console.log("EMAIL:", EMAIL);
console.log("BREVO_USER:", BREVO_USER);
console.log("BREVO_PASS EXISTS:", !!BREVO_PASS);

// SMTP TRANSPORT (BREVO)
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: BREVO_USER,
    pass: BREVO_PASS
  }
});

// VERIFY SMTP ON START
transporter.verify((error) => {
  if (error) {
    console.log("❌ SMTP FAILED:");
    console.log(error);
  } else {
    console.log("✅ SMTP READY");
  }
});

// TEST ROUTE
app.get("/test", (req, res) => {
  res.send("Server working");
});

// QUOTE ROUTE
app.post("/send-quote", async (req, res) => {
  const { name, email, message } = req.body;

  console.log("📩 Incoming quote:", req.body);

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: "Missing fields"
    });
  }

  try {
    await transporter.sendMail({
      from: `"SPS Electrical" <${EMAIL}>`,
      to: EMAIL,
      subject: "New SPS Electrical Quote Request",
      text: `
Name: ${name}
Email: ${email}
Message: ${message}
      `
    });

    console.log("✅ Email sent");

    return res.json({ success: true });

  } catch (err) {
    console.log("❌ EMAIL ERROR:");
    console.log(err);

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
