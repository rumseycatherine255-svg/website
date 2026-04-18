const express = require("express");
const path = require("path");
const { Resend } = require("resend");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const resend = new Resend(process.env.RESEND_API_KEY);

let chats = {};
let quotes = [];

/* QUOTE */
app.post("/send-quote", async (req, res) => {
  const { name, email, phone, address, message } = req.body;

  quotes.push({ name, email, phone, address, message });

  await resend.emails.send({
    from: "SPS <onboarding@resend.dev>",
    to: process.env.EMAIL,
    subject: "New Quote",
    html: `
      <p>${name}</p>
      <p>${email}</p>
      <p>${phone}</p>
      <p>${address}</p>
      <p>${message}</p>
    `
  });

  res.json({ success: true });
});

/* CHAT */
app.post("/send-message", (req, res) => {
  const { name, message } = req.body;

  if (!chats[name]) chats[name] = [];
  chats[name].push({ sender: "user", message });

  res.json({ success: true });
});

/* DATA */
app.get("/data", (req, res) => {
  res.json({ chats, quotes });
});

app.listen(8080, () => console.log("Running on 8080"));
