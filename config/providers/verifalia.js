const { VerifaliaRestClient, WaitOptions } = require('verifalia');
const { pickVerifaliaAccount, markVerifaliaUsage } = require('./verifaliaAccounts');

const NAME = 'Verifalia';
const POLL_DELAY_MS = Number(process.env.VERIFALIA_POLL_DELAY_MS || '1000');
const MAX_POLLS = Number(process.env.VERIFALIA_MAX_POLLS || '8');

async function verify(email) {
  const account = pickVerifaliaAccount();
  const username = account.username;
  const password = account.password;

  if (!username || !password) {
    throw new Error(`${NAME}: at least one VERIFALIA_USERNAME_<n> and VERIFALIA_PASSWORD_<n> pair must be set`);
  }

  const client = new VerifaliaRestClient({ username, password });
  const job = await client.emailValidations.submit(email, WaitOptions.noWait);
  const jobId = job?.overview?.id;

  if (!jobId) {
    throw new Error(`${NAME}: invalid submit response`);
  }

  markVerifaliaUsage(account);

  if (!jobId) {
    throw new Error(`${NAME}: invalid submit response`);
  }

  let result = await client.emailValidations.get(jobId);
  let attempts = 0;

  while (
    result?.overview?.status &&
    result.overview.status !== 'Completed' &&
    result.overview.status !== 'Failed' &&
    attempts < MAX_POLLS
  ) {
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
    result = await client.emailValidations.get(jobId);
    attempts += 1;
  }

  if (!result?.entries?.length) {
    throw new Error(`${NAME}: no entries returned; status=${result?.overview?.status}`);
  }

  // const entry = result.entries[0];
  // const classification = entry.classification;
  // const status = entry.status || classification;
  // const valid = [
  //   'Deliverable',
  //   'Risky',
  //   'Acceptable',
  //   'AcceptAll',
  //   'Success',
  // ].includes(classification) || status === 'Success';

  // return {
  //   provider: NAME,
  //   email,
  //   valid,
  //   status,
  //   score: entry.score ?? null,
  //   reason: entry.status === 'Failed' ? entry.classification || 'Failed' : null,
  //   disposable: Boolean(entry.isDisposableEmailAddress),
  //   freeProvider: Boolean(entry.isFreeEmailAddress),
  //   roleAccount: Boolean(entry.isRoleAccount),
  //   catchAll: Boolean(entry.isCatchAll),
  //   raw: result,
  // };
  const entry = result.entries[0];
  const classification = entry.classification;

  const CLASSIFICATION_TO_STATUS = {
    Deliverable: 'deliverable',
    Undeliverable: 'undeliverable',
    Risky: 'risky',
    Unknown: 'unknown',
  };
  const status = CLASSIFICATION_TO_STATUS[classification] || 'unknown';
  const valid = status === 'deliverable' || (status === 'risky' && entry.isCatchAll);

  return {
    provider: NAME,
    email,
    valid,
    status,
    score: entry.score ?? null,
    reason: entry.status === 'Failed' ? classification || 'Failed' : null,
    domain: email.split('@')[1]?.toLowerCase() || null,
    disposable: Boolean(entry.isDisposableEmailAddress),
    freeProvider: Boolean(entry.isFreeEmailAddress),
    roleAccount: Boolean(entry.isRoleAccount),
    catchAll: Boolean(entry.isCatchAll),
    raw: result,
  };
}

module.exports = { name: NAME, verify };