<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SPS Electrical</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: white;
    }

    header {
      background: linear-gradient(90deg, #1e3a8a, #2563eb);
      padding: 20px;
      text-align: center;
    }

    header h1 {
      margin: 0;
      font-size: 2.5rem;
    }

    header p {
      margin-top: 5px;
      color: #cbd5f5;
    }

    .hero {
      text-align: center;
      padding: 60px 20px;
      background: radial-gradient(circle, #1e293b, #020617);
    }

    .hero h2 {
      font-size: 2rem;
      margin-bottom: 10px;
    }

    .hero p {
      color: #94a3b8;
    }

    .container {
      max-width: 1000px;
      margin: auto;
      padding: 20px;
    }

    .services {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }

    .card {
      background: #1e293b;
      padding: 20px;
      border-radius: 12px;
      transition: 0.3s;
      border: 1px solid #334155;
    }

    .card:hover {
      transform: translateY(-5px);
      border-color: #3b82f6;
    }

    .card h3 {
      margin-top: 0;
      color: #60a5fa;
    }

    form {
      margin-top: 30px;
      background: #1e293b;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #334155;
    }

    input, textarea {
      width: 100%;
      padding: 12px;
      margin: 10px 0;
      border-radius: 8px;
      border: none;
      background: #020617;
      color: white;
    }

    button {
      width: 100%;
      padding: 12px;
      background: #3b82f6;
      border: none;
      color: white;
      font-size: 1rem;
      border-radius: 8px;
      cursor: pointer;
      transition: 0.2s;
    }

    button:hover {
      background: #2563eb;
    }

    .status {
      margin-top: 10px;
      text-align: center;
    }

    footer {
      text-align: center;
      padding: 20px;
      color: #64748b;
    }
  </style>
</head>
<body>

<header>
  <h1>SPS Electrical</h1>
  <p>Reliable • Professional • Local Electrician</p>
</header>

<section class="hero">
  <h2>Powering Your Home & Business</h2>
  <p>Fast, reliable electrical services you can trust</p>
</section>

<div class="container">

  <h2>Our Services</h2>
  <div class="services">
    <div class="card">
      <h3>Rewiring</h3>
      <p>Full and partial house rewires.</p>
    </div>
    <div class="card">
      <h3>Lighting</h3>
      <p>Indoor & outdoor lighting installs.</p>
    </div>
    <div class="card">
      <h3>Fuse Boards</h3>
      <p>Upgrades and replacements.</p>
    </div>
    <div class="card">
      <h3>Fault Finding</h3>
      <p>Quick diagnosis and repairs.</p>
    </div>
  </div>

  <h2>Request a Quote</h2>

  <form id="quoteForm">
    <input type="text" name="name" placeholder="Your Name" required>
    <input type="email" name="email" placeholder="Your Email" required>
    <textarea name="message" placeholder="Describe the job..." required></textarea>
    <button type="submit">Send Quote</button>
    <div class="status" id="status"></div>
  </form>

</div>

<footer>
  © 2026 SPS Electrical
</footer>

<script>
  const form = document.getElementById('quoteForm');
  const status = document.getElementById('status');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    status.textContent = "Sending...";

    const data = {
      name: form.name.value,
      email: form.email.value,
      message: form.message.value
    };

    try {
      const res = await fetch('/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        status.textContent = "✅ Quote sent successfully!";
        form.reset();
      } else {
        status.textContent = "❌ Failed to send. Try again.";
      }
    } catch (err) {
      status.textContent = "❌ Server error.";
    }
  });
</script>

</body>
</html>
