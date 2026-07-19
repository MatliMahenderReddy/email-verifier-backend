const axios = require('axios');

const NAME = 'QuickEmailVerification';

async function verify(email) {
  const apiKey = process.env.QEV_API_KEY;
  if (!apiKey) throw new Error(`${NAME}: API key not configured`);

  const url = `https://api.quickemailverification.com/v1/verify`;
  const { data } = await axios.get(url, {
    params: { email, apikey: apiKey },
    timeout: 10000,
  });

  // QuickEmailVerification result values: valid, invalid, unknown
  const result = data.result; // "valid" | "invalid" | "unknown"
  const isValid = result === 'valid';

  return {
    provider: NAME,
    email,
    valid: isValid,
    status: result,
    reason: data.reason || null,
    raw: data,
  };
}

module.exports = { name: NAME, verify };
