const axios = require('axios');

const NAME = 'ZeroBounce';

async function verify(email) {
  const apiKey = process.env.ZEROBOUNCE_API_KEY;
  if (!apiKey) throw new Error(`${NAME}: API key not configured`);

  const url = `https://api.zerobounce.net/v2/validate`;
  const { data } = await axios.get(url, {
    params: { api_key: apiKey, email },
    timeout: 10000,
  });

  // ZeroBounce status: "valid" | "invalid" | "catch-all" | "unknown" | "spamtrap" | "abuse" | "do_not_mail"
  const status = data.status;
  const isValid = status === 'valid' || status === 'catch-all';

  return {
    provider: NAME,
    email,
    valid: isValid,
    status,
    reason: data.sub_status || null,
    raw: data,
  };
}

module.exports = { name: NAME, verify };
