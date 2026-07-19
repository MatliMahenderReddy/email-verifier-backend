const axios = require('axios');

const NAME = 'AbstractAPI';

async function verify(email) {
  const apiKey = process.env.ABSTRACT_API_KEY;
  if (!apiKey) throw new Error(`${NAME}: API key not configured`);

  const url = `https://emailvalidation.abstractapi.com/v1/`;
  const { data } = await axios.get(url, {
    params: { api_key: apiKey, email },
    timeout: 10000,
  });

  // Abstract API returns deliverability: "DELIVERABLE" | "UNDELIVERABLE" | "RISKY" | "UNKNOWN"
  const deliverability = data.deliverability;
  const isValid = deliverability === 'DELIVERABLE';

  return {
    provider: NAME,
    email,
    valid: isValid,
    status: deliverability,
    reason: data.is_disposable_email && data.is_disposable_email.value ? 'disposable' : null,
    raw: data,
  };
}

module.exports = { name: NAME, verify };
