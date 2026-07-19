const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const validUsername = process.env.AUTH_USERNAME;
  const plainPassword = process.env.AUTH_PASSWORD;
  const passwordHash = process.env.AUTH_PASSWORD_HASH;
console.log("validUsername",validUsername)
console.log("plainPassword",plainPassword)
  if (!validUsername || (!plainPassword )) {
    return res.status(500).json({
      error: 'Server auth is not configured. Set AUTH_USERNAME and AUTH_PASSWORD (or AUTH_PASSWORD_HASH) in .env',
    });
  }

  if (username !== validUsername) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Plain-text password takes priority if set (simplest setup).
  // Falls back to bcrypt hash comparison if AUTH_PASSWORD_HASH is used instead.
  let passwordMatches = false;
  if (plainPassword) {
    passwordMatches = password === plainPassword;
  } 

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, username });
});

module.exports = router;
