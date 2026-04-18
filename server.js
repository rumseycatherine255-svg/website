const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Fix homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🔐 Env variables
const EMAIL = process.env.EMAIL;
const PASS = process.env.APP_PASSWORD;

// Mail setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL,
    pass: PASS
  }
});

// 📩 Form route
app.post('/send-quote', async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).send('Missing fields');
  }

  try {
    await transporter.sendMail({
      from: `"SPS Electrical Website" <${EMAIL}>`,
      to: EMAIL,
      subject: 'New Quote Request - SPS Electrical',
      text: `
Name: ${name}
Email: ${email}
Message: ${message}
      `
    });

    res.status(200).send('Email sent');
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to send email');
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
