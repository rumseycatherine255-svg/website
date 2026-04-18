const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serves index.html

// 🔐 USE ENV VARIABLES IN PRODUCTION
const EMAIL = process.env.EMAIL;
const PASS = process.env.APP_PASSWORD;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL,
    pass: PASS
  }
});

app.post('/send-quote', async (req, res) => {
  const { name, email, message } = req.body;

  try {
    await transporter.sendMail({
      from: EMAIL,
      to: EMAIL,
      subject: 'New SPS Electrical Quote Request',
      text: `
Name: ${name}
Email: ${email}
Message: ${message}
      `
    });

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
