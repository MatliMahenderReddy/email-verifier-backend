const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'credits.json');

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { date: todayKey(), usage: {} };
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { date: todayKey(), usage: {} };
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function ensureFreshDay() {
  const data = readData();
  if (data.date !== todayKey()) {
    return { date: todayKey(), usage: {} };
  }
  return data;
}

// Returns true if provider still has quota left today
function hasQuota(providerName, dailyLimit) {
  const data = ensureFreshDay();
  const used = data.usage[providerName] || 0;
  return used < dailyLimit;
}

// Increments usage count for a provider after a successful call
function recordUsage(providerName) {
  const data = ensureFreshDay();
  data.usage[providerName] = (data.usage[providerName] || 0) + 1;
  writeData(data);
}

function getUsageReport(providers) {
  const data = ensureFreshDay();
  return providers.map((p) => ({
    name: p.name,
    used: data.usage[p.name] || 0,
    dailyLimit: p.dailyLimit,
    remaining: Math.max(0, p.dailyLimit - (data.usage[p.name] || 0)),
  }));
}

module.exports = { hasQuota, recordUsage, getUsageReport };
