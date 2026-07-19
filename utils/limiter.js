// Simple semaphore so we never have more than MAX_CONCURRENT_SMTP raw SMTP
// sockets open at once, whatever the traffic to the API is. Keeps memory and
// outbound connection count sane on cheap VPS hosting.

const MAX_CONCURRENT_SMTP = Number(process.env.MAX_CONCURRENT_SMTP || 5);

let active = 0;
const waiting = [];

function acquire() {
  if (active < MAX_CONCURRENT_SMTP) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  active--;
  const next = waiting.shift();
  if (next) {
    active++;
    next();
  }
}

async function withLimit(task) {
  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
}

module.exports = { withLimit };
