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

let collection = null;
let mongoReady = false;

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

// Increments usage count for a provider after a successful call.
// Writes to the JSON file synchronously as before (nothing else changes
// behavior), and also mirrors the write to MongoDB in the background so
// counts survive a server restart / redeploy. The Mongo write is
// fire-and-forget: it never blocks or slows down the caller, and if it
// fails the JSON file (already written) remains correct.
function recordUsage(providerName) {
  const data = ensureFreshDay();
  data.usage[providerName] = (data.usage[providerName] || 0) + 1;
  writeData(data);

  if (mongoReady && collection) {
    const key = todayKey();
    collection
      .updateOne(
        { date: key },
        { $inc: { [`usage.${providerName}`]: 1 } },
        { upsert: true }
      )
      .catch((err) => {
        console.error('[credits] Mongo mirror write failed (JSON already saved):', err.message);
      });
  }
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

// ---------------- MongoDB bootstrap ----------------
// Runs once when this module is first required. Connects to Mongo (if
// configured) and, if today's usage doc already exists there (e.g. from
// before the server restarted), restores it into the JSON file so counts
// aren't lost. This is the fix for "credits reset to 0 on restart" — most
// hosts wipe local disk on redeploy, so JSON alone can't survive that, but
// Mongo does.
async function bootstrapMongo() {
  if (!MONGODB_URI) {
    console.warn('[credits] MONGODB_URI not set — running on JSON file only, same as before');
    return;
  }

  try {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(MONGODB_DB);
    collection = db.collection(COLLECTION_NAME);
    await collection.createIndex({ date: 1 }, { unique: true });

    const key = todayKey();
    const remoteDoc = await collection.findOne({ date: key });

    if (remoteDoc) {
      // Restore into JSON so existing sync reads/writes pick it up immediately.
      writeData({ date: remoteDoc.date, usage: remoteDoc.usage || {} });
      console.log('[credits] Restored today\'s usage from MongoDB into credits.json');
    } else {
      // Seed Mongo with whatever's currently in the JSON file (first run, or
      // a day with local-only data so far).
      const local = ensureFreshDay();
      await collection.updateOne(
        { date: key },
        { $setOnInsert: local },
        { upsert: true }
      );
    }

    mongoReady = true;
    console.log('[credits] MongoDB connected — usage will now survive restarts');
  } catch (err) {
    console.error('[credits] MongoDB unavailable, continuing on JSON file only:', err.message);
    mongoReady = false;
  }
}

// Kick off the bootstrap immediately on module load. hasQuota/recordUsage/
// getUsageReport remain fully synchronous throughout — nothing else in the
// app has to change or await anything.
bootstrapMongo();

module.exports = { hasQuota, recordUsage, getUsageReport };