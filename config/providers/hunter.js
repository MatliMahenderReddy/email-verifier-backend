const axios = require('axios');

const NAME = 'Hunter';

// Hunter statuses: valid, invalid, accept_all, webmail, disposable, unknown
async function verify(email) {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) throw new Error(`${NAME}: API key not configured`);

  const url = 'https://api.hunter.io/v2/email-verifier';
  const { data } = await axios.get(url, {
    params: { email, api_key: apiKey },
    timeout: 10000,
  });

  const result = data.data || {};
  const status = result.status; // preferred over deprecated "result" field
  const isValid = status === 'valid' || status === 'accept_all';

  return {
    provider: NAME,
    email,
    valid: isValid,
    status,
    score: result.score,
    reason: status === 'invalid' ? 'Hunter marked this mailbox as invalid' : null,
    disposable: !!result.disposable,
    freeProvider: !!result.webmail,
    catchAll: status === 'accept_all',
    raw: data,
  };
}

module.exports = { name: NAME, verify };