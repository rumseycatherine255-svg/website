const express = require("express");
const path = require("path");
const { Resend } = require("resend");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* EMAIL SETUP */
const resend = new Resend(process.env.RESEND_API_KEY);

/* STORAGE (TEMP - resets on restart) */
let chats = {};
let quotes = [];

/* ---------------- QUOTE ---------------- */
app.post("/send-quote", async (req, res) => {
  const { name, email, phone, address, message } = req.body;

  if (!name || !email || !phone || !address || !message) {
    return res.json({ success: false, error: "Missing fields" });
  }

  try {
    await resend.emails.send({
      from: "SPS <onboarding@resend.dev>",
      to: process.env.EMAIL || "YOUR_EMAIL@gmail.com",
      subject: "⚡ NEW QUOTE REQUEST",
      html: `
        <h2>New Quote Request</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>Address:</b> ${address}</p>
        <p><b
