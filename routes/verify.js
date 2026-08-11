const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { verifyEmail, verifyEmailBatch } = require('../utils/verifyEmail');
const { getProviderChain } = require('../config/providers');
const { getUsageReport } = require('../utils/creditTracker');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// POST /api/verify/single  { email: "a@b.com" }
router.post('/single', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const result = await verifyEmail(email.trim());
  res.json(result);
});

// POST /api/verify/bulk  { emails: ["a@b.com", "c@d.com", ...] }
router.post('/bulk', requireAuth, async (req, res) => {
  const { emails } = req.body;
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'emails must be a non-empty array' });
  }
  if (emails.length > 1000) {
    return res.status(400).json({ error: 'Max 1000 emails per request' });
  }

  const cleaned = [...new Set(emails.map((e) => String(e).trim()).filter(Boolean))];
  const results = await verifyEmailBatch(cleaned);
  res.json({ total: results.length, results });
});

// POST /api/verify/upload  (multipart/form-data, field name "file", .csv or .txt, one email per line)
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const text = req.file.buffer.toString('utf-8');
  const emails = text
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter((line) => line && line.includes('@'));

  if (emails.length === 0) {
    return res.status(400).json({ error: 'No valid-looking emails found in file' });
  }
  if (emails.length > 1000) {
    return res.status(400).json({ error: 'Max 1000 emails per upload' });
  }

  const cleaned = [...new Set(emails)];
  const results = await verifyEmailBatch(cleaned);
  res.json({ total: results.length, results });
});

// GET /api/verify/status  -> shows today's usage/remaining quota per provider
router.get('/status',  (req, res) => {
  const chain = getProviderChain().map((p) => ({
    name: p.name,
    dailyLimit: p.dailyLimit === Infinity ? 'unlimited' : p.dailyLimit,
    configured: p.hasKey(),
  }));
  const usage = getUsageReport(
    getProviderChain()
      .filter((p) => p.dailyLimit !== Infinity)
      .map((p) => ({ name: p.name, dailyLimit: p.dailyLimit }))
  );
  res.json({ providers: chain, usage });
});

module.exports = router;
