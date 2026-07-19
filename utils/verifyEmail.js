// const { getProviderChain } = require('../config/providers');
// const { hasQuota, recordUsage } = require('./creditTracker');

// /**
//  * Verifies a single email address by walking the provider chain.
//  * Skips providers with no API key configured or no remaining daily quota.
//  * Falls back to the next provider on any error. The own SMTP verifier
//  * is unlimited and always last, so this always resolves to a result.
//  */
// async function verifyEmail(email) {
//   const chain = getProviderChain();
//   const attempts = [];

//   for (const provider of chain) {
//     if (!provider.hasKey()) {
//       attempts.push({ provider: provider.name, skipped: 'no API key configured' });
//       continue;
//     }

//     if (provider.dailyLimit !== Infinity && !hasQuota(provider.name, provider.dailyLimit)) {
//       attempts.push({ provider: provider.name, skipped: 'daily free quota used up' });
//       continue;
//     }

//     try {
//       const result = await provider.verify(email);
//       if (provider.dailyLimit !== Infinity) recordUsage(provider.name);
//       return { ...result, attempts };
//     } catch (err) {
//       attempts.push({ provider: provider.name, error: err.message });
//       // move on to next provider in the chain
//       continue;
//     }
//   }

//   // Should not normally reach here since OwnVerifier has no key requirement,
//   // but guard just in case everything above threw synchronously.
//   return {
//     provider: 'none',
//     email,
//     valid: false,
//     status: 'verification_failed',
//     reason: 'All providers failed or were unavailable',
//     attempts,
//   };
// }

// /**
//  * Verifies a batch of emails sequentially with a small delay between calls
//  * to stay polite to free-tier rate limits. Returns results in the same order.
//  */
// async function verifyEmailBatch(emails, { delayMs = 150 } = {}) {
//   const results = [];
//   for (const email of emails) {
//     const result = await verifyEmail(email.trim());
//     results.push(result);
//     if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
//   }
//   return results;
// }

// module.exports = { verifyEmail, verifyEmailBatch };


const { getProviderChain } = require('../config/providers');
const { hasQuota, recordUsage } = require('./creditTracker');
const { normalizeResult } = require('./normalizeresult');

/**
 * Verifies a single email address by walking the provider chain.
 * Skips providers with no API key configured or no remaining daily quota.
 * Falls back to the next provider on any error. The own SMTP verifier
 * is unlimited and always last, so this always resolves to a result.
 *
 * Every result is passed through normalizeResult() before being returned,
 * so callers (the frontend, CSV export, etc.) always see the same field
 * names regardless of which provider actually answered the request.
 */
async function verifyEmail(email) {
  const chain = getProviderChain();
  const attempts = [];

  for (const provider of chain) {
    if (!provider.hasKey()) {
      attempts.push({ provider: provider.name, skipped: 'no API key configured' });
      continue;
    }

    if (provider.dailyLimit !== Infinity && !hasQuota(provider.name, provider.dailyLimit)) {
      attempts.push({ provider: provider.name, skipped: 'daily free quota used up' });
      continue;
    }

    try {
      const result = await provider.verify(email);
      if (provider.dailyLimit !== Infinity) recordUsage(provider.name);
      return normalizeResult({ ...result, attempts });
    } catch (err) {
      attempts.push({ provider: provider.name, error: err.message });
      // move on to next provider in the chain
      continue;
    }
  }

  // Should not normally reach here since OwnVerifier has no key requirement,
  // but guard just in case everything above threw synchronously.
  return normalizeResult({
    provider: 'none',
    email,
    valid: false,
    status: 'verification_failed',
    reason: 'All providers failed or were unavailable',
    attempts,
  });
}

/**
 * Verifies a batch of emails sequentially with a small delay between calls
 * to stay polite to free-tier rate limits. Returns results in the same order.
 */
async function verifyEmailBatch(emails, { delayMs = 150 } = {}) {
  const results = [];
  for (const email of emails) {
    const result = await verifyEmail(email.trim());
    results.push(result);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}

module.exports = { verifyEmail, verifyEmailBatch };