// const fs = require('fs');
// const path = require('path');

// const DATA_FILE = path.join(__dirname, '..', 'data', 'credits.json');

// function todayKey() {
//   return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
// }

// function readData() {
//   if (!fs.existsSync(DATA_FILE)) {
//     return { date: todayKey(), usage: {} };
//   }
//   try {
//     const raw = fs.readFileSync(DATA_FILE, 'utf-8');
//     return JSON.parse(raw);
//   } catch (e) {
//     return { date: todayKey(), usage: {} };
//   }
// }

// function writeData(data) {
//   fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
//   fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
// }

// function ensureFreshDay() {
//   const data = readData();
//   if (data.date !== todayKey()) {
//     return { date: todayKey(), usage: {} };
//   }
//   return data;
// }

// // Returns true if provider still has quota left today
// function hasQuota(providerName, dailyLimit) {
//   const data = ensureFreshDay();
//   const used = data.usage[providerName] || 0;
//   return used < dailyLimit;
// }

// // Increments usage count for a provider after a successful call
// function recordUsage(providerName) {
//   const data = ensureFreshDay();
//   data.usage[providerName] = (data.usage[providerName] || 0) + 1;
//   writeData(data);
// }

// function getUsageReport(providers) {
//   const data = ensureFreshDay();
//   return providers.map((p) => ({
//     name: p.name,
//     used: data.usage[p.name] || 0,
//     dailyLimit: p.dailyLimit,
//     remaining: Math.max(0, p.dailyLimit - (data.usage[p.name] || 0)),
//   }));
// }

// module.exports = { hasQuota, recordUsage, getUsageReport };


const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const DATA_FILE = path.join(__dirname, '..', 'data', 'credits.json');
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'app';
const COLLECTION_NAME = 'credits';

let client = null;
let collection = null;
let mongoReady = false;
let mongoAttempted = false;

// Lazily connect once; if it fails, remember that and don't retry every call.
async function initMongo() {
  if (mongoAttempted) return mongoReady;
  mongoAttempted = true;

  if (!MONGODB_URI) {
    console.warn('[credits] MONGODB_URI not set — using JSON file fallback');
    return false;
  }

  try {
    client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(MONGODB_DB);
    collection = db.collection(COLLECTION_NAME);
    await collection.createIndex({ date: 1 }, { unique: true });
    mongoReady = true;
    console.log('[credits] Connected to MongoDB for credit persistence');
    return true;
  } catch (err) {
    console.error('[credits] MongoDB connection failed, falling back to JSON file:', err.message);
    mongoReady = false;
    return false;
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---------------- JSON fallback ----------------

function readJsonData() {
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

function writeJsonData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function ensureFreshDayJson() {
  const data = readJsonData();
  if (data.date !== todayKey()) {
    const fresh = { date: todayKey(), usage: {} };
    writeJsonData(fresh);
    return fresh;
  }
  return data;
}

// ---------------- Mongo helpers ----------------

async function ensureFreshDayMongo() {
  const key = todayKey();
  let doc = await collection.findOne({ date: key });
  if (!doc) {
    doc = { date: key, usage: {} };
    await collection.updateOne(
      { date: key },
      { $setOnInsert: doc },
      { upsert: true }
    );
  }
  return doc;
}

// ---------------- Public API ----------------

async function ensureFreshDay() {
  const useMongo = await initMongo();
  if (useMongo) {
    try {
      return await ensureFreshDayMongo();
    } catch (err) {
      console.error('[credits] Mongo read failed, falling back to JSON:', err.message);
      mongoReady = false;
    }
  }
  return ensureFreshDayJson();
}

// Returns true if provider still has quota left today
async function hasQuota(providerName, dailyLimit) {
  const data = await ensureFreshDay();
  const used = (data.usage && data.usage[providerName]) || 0;
  return used < dailyLimit;
}

// Increments usage count for a provider after a successful call
async function recordUsage(providerName) {
  const key = todayKey();

  if (mongoReady) {
    try {
      await collection.updateOne(
        { date: key },
        { $inc: { [`usage.${providerName}`]: 1 } },
        { upsert: true }
      );
      return;
    } catch (err) {
      console.error('[credits] Mongo write failed, falling back to JSON:', err.message);
      mongoReady = false;
    }
  }

  // JSON fallback path (also used if Mongo was never configured)
  const data = ensureFreshDayJson();
  data.usage[providerName] = (data.usage[providerName] || 0) + 1;
  writeJsonData(data);
}

async function getUsageReport(providers) {
  const data = await ensureFreshDay();
  return providers.map((p) => {
    const used = (data.usage && data.usage[p.name]) || 0;
    return {
      name: p.name,
      used,
      dailyLimit: p.dailyLimit,
      remaining: Math.max(0, p.dailyLimit - used),
    };
  });
}

// Call this on graceful shutdown (SIGTERM/SIGINT handler) to close the pool cleanly
async function closeMongo() {
  if (client) {
    await client.close();
  }
}

module.exports = { hasQuota, recordUsage, getUsageReport, closeMongo };