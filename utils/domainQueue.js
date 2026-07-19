// // Ensures we never open two SMTP connections to the same receiving domain
// // at once, and waits a short delay between them. This is the single biggest
// // factor in avoiding your server IP being flagged/blocked by big mail
// // providers (Gmail/Outlook/Yahoo watch for rapid repeated RCPT TO probes
// // from the same source IP).

// const queues = new Map(); // domain -> Promise chain
// const lastHitAt = new Map(); // domain -> timestamp of last SMTP attempt

// const SAME_DOMAIN_DELAY_MS = Number(process.env.SAME_DOMAIN_DELAY_MS || 1500);

// function sleep(ms) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }

// /**
//  * Runs `task` (an async function) so that calls for the same domain never
//  * overlap and are spaced at least SAME_DOMAIN_DELAY_MS apart.
//  */
// function runQueued(domain, task) {
//   const key = domain.toLowerCase();
//   const prev = queues.get(key) || Promise.resolve();

//   const next = prev
//     .catch(() => {}) // don't let one failure poison the chain
//     .then(async () => {
//       const last = lastHitAt.get(key) || 0;
//       const wait = SAME_DOMAIN_DELAY_MS - (Date.now() - last);
//       if (wait > 0) await sleep(wait);
//       lastHitAt.set(key, Date.now());
//       return task();
//     });

//   queues.set(key, next);
//   return next;
// }

// module.exports = { runQueued };



// Ensures we never open two SMTP connections to the same receiving domain
// at once, and waits a short delay between them. This is the single biggest
// factor in avoiding your server IP being flagged/blocked by big mail
// providers (Gmail/Outlook/Yahoo watch for rapid repeated RCPT TO probes
// from the same source IP).
//
// Also cleans up idle domain entries after a period of inactivity so the
// queues/lastHitAt maps don't grow unbounded over a long-running process
// that sees many unique domains.

const queues = new Map(); // domain -> Promise chain
const lastHitAt = new Map(); // domain -> timestamp of last SMTP attempt
const cleanupTimers = new Map(); // domain -> pending cleanup timeout handle

const SAME_DOMAIN_DELAY_MS = Number(process.env.SAME_DOMAIN_DELAY_MS || 1500);

// How long a domain can sit idle (no new tasks queued) before we drop its
// bookkeeping entries. This does NOT affect correctness -- if a new task
// comes in for the domain after cleanup, it just starts a fresh chain.
const CLEANUP_AFTER_MS = Number(process.env.DOMAIN_QUEUE_CLEANUP_MS || 10 * 60 * 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleCleanup(key, chainRef) {
  // Cancel any previously scheduled cleanup for this domain -- we only want
  // one pending cleanup timer per domain, tied to the latest chain.
  const existingTimer = cleanupTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    // Only delete if nothing newer has queued in the meantime. If queues.get(key)
    // is no longer === chainRef, a new task came in after this one finished,
    // so its own cleanup timer owns the entry now.
    if (queues.get(key) === chainRef) {
      queues.delete(key);
      lastHitAt.delete(key);
    }
    cleanupTimers.delete(key);
  }, CLEANUP_AFTER_MS);

  // Don't let this timer keep the process alive on its own.
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  cleanupTimers.set(key, timer);
}

/**
 * Runs `task` (an async function) so that calls for the same domain never
 * overlap and are spaced at least SAME_DOMAIN_DELAY_MS apart.
 */
function runQueued(domain, task) {
  const key = domain.toLowerCase();
  const prev = queues.get(key) || Promise.resolve();

  const next = prev
    .catch(() => {}) // don't let one failure poison the chain
    .then(async () => {
      const last = lastHitAt.get(key) || 0;
      const wait = SAME_DOMAIN_DELAY_MS - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      lastHitAt.set(key, Date.now());
      return task();
    });

  queues.set(key, next);

  // Once this task settles (success or failure), schedule a cleanup check.
  // We attach with .finally via a separate promise chain so we don't alter
  // what callers of runQueued actually receive/await.
  next.then(
    () => scheduleCleanup(key, next),
    () => scheduleCleanup(key, next)
  );

  return next;
}

/**
 * Optional: expose current queue size for monitoring/metrics.
 */
function getQueueStats() {
  return {
    activeDomains: queues.size,
    trackedTimestamps: lastHitAt.size,
    pendingCleanups: cleanupTimers.size,
  };
}

module.exports = { runQueued, getQueueStats };