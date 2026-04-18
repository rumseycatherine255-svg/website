const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// Homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ENV
const EMAIL = process.env.EMAIL;
const PASS = process.env.APP_PASSWORD;

// Safety check (VERY IMPORTANT for debugging)
if (!EMAIL || !PASS) {
  console.log("❌ Missing EMAIL or APP_PASSWORD in Railway variables");
}

// Mail setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL,
    pass: PASS
  }
});

// Test route (debug)
app.get('/test', (req, res) => {
  res.send("Server is working");
});

// Quote route
app.post('/send-quote', async (req, res) => {
  const { name, email, message } = req.body;

  console.log("📩 Incoming quote:", req.body);

  if (!name || !email || !message) {
    return res.status(400).send("Missing fields");
  }

  try {
    await transporter.sendMail({
      from: `"SPS Electrical Website" <${EMAIL}>`,
      to: EMAIL,
      subject: "New Quote Request",
      text: `
Name: ${name}
Email: ${email}
Message: ${message}
      `
    });

    console.log("✅ Email sent");

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Email error:", err);

    return res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
