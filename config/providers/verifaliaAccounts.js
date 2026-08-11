const { hasQuota, recordUsage } = require('../../utils/creditTracker');

const MAX_ACCOUNTS = Number(process.env.VERIFALIA_MAX_ACCOUNTS || '6');
const ACCOUNT_DAILY_LIMIT = Number(process.env.VERIFALIA_ACCOUNT_DAILY_LIMIT || '25');
let nextAccountIndex = 0;

function getVerifaliaAccounts() {
  const accounts = [];
  for (let i = 1; i <= MAX_ACCOUNTS; i += 1) {
    const username = process.env[`VERIFALIA_USERNAME_${i}`];
    const password = process.env[`VERIFALIA_PASSWORD_${i}`];
    if (username && password) {
      accounts.push({ username, password, index: i });
    }
  }
  return accounts;
}

function getUsageKey(accountIndex) {
  return `VerifaliaAccount_${accountIndex}`;
}

function getAccountReport(account) {
  const key = getUsageKey(account.index);
  const used = getUsageCount(key);
  return {
    index: account.index,
    key,
    used,
    dailyLimit: ACCOUNT_DAILY_LIMIT,
    remaining: Math.max(0, ACCOUNT_DAILY_LIMIT - used),
  };
}

function getUsageCount(key) {
  const data = ensureFreshData();
  return data.usage[key] || 0;
}

function ensureFreshData() {
  return require('../../utils/creditTracker').ensureFreshDay();
}

function getVerifaliaAccountCount() {
  return getVerifaliaAccounts().length;
}

function getProviderUsageKey() {
  return 'VerifaliaProvider';
}

function getVerifaliaProviderDailyLimit() {
  return getVerifaliaAccountCount() * ACCOUNT_DAILY_LIMIT;
}

function getVerifaliaUsageSummary() {
  const accounts = getVerifaliaAccounts();
  const summaries = accounts.map(getAccountReport);
  return {
    accounts: summaries,
    totalUsed: summaries.reduce((sum, item) => sum + item.used, 0),
    totalRemaining: summaries.reduce((sum, item) => sum + item.remaining, 0),
    totalDailyLimit: summaries.reduce((sum, item) => sum + item.dailyLimit, 0),
  };
}

function pickVerifaliaAccount() {
  const accounts = getVerifaliaAccounts();
  if (accounts.length === 0) {
    throw new Error(
      'Verifalia: at least one VERIFALIA_USERNAME_<n> and VERIFALIA_PASSWORD_<n> pair must be configured'
    );
  }

  const startIndex = nextAccountIndex;
  for (let i = 0; i < accounts.length; i += 1) {
    const candidateIndex = (startIndex + i) % accounts.length;
    const candidate = accounts[candidateIndex];
    const usageKey = getUsageKey(candidate.index);

    if (hasQuota(usageKey, ACCOUNT_DAILY_LIMIT)) {
      nextAccountIndex = (candidateIndex + 1) % accounts.length;
      return { ...candidate, usageKey };
    }
  }

  throw new Error('Verifalia: all configured accounts have exhausted their daily limit');
}

function markVerifaliaUsage(account) {
  if (!account || !account.usageKey) return;
  recordUsage(account.usageKey);
  recordUsage(getProviderUsageKey());
}

module.exports = {
  getVerifaliaAccounts,
  getVerifaliaAccountCount,
  getVerifaliaProviderDailyLimit,
  getProviderUsageKey,
  getVerifaliaUsageSummary,
  pickVerifaliaAccount,
  markVerifaliaUsage,
  ACCOUNT_DAILY_LIMIT,
};