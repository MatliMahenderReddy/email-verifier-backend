const net = require("net");

const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 8000);
const HELO_DOMAIN = process.env.SMTP_HELO_DOMAIN || "localhost";
const FROM_ADDRESS = process.env.SMTP_FROM_ADDRESS || `verify@${HELO_DOMAIN}`;

/**
 * Opens a raw SMTP connection to `host:25`, reads the greeting, and returns
 * a small helper object to send commands and read responses line-by-line.
 * Caller is responsible for calling quit()/destroy() when done.
 */
function connect(host) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: 25 });
    let buffer = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error("SMTP connection timed out"));
      }
    }, SMTP_TIMEOUT_MS);

    socket.once("connect", () => {}); // wait for the greeting banner instead

    socket.once("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    // Resolve once we get the initial 220 greeting
    function onData(chunk) {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\r\n") || buffer.includes("\n")) {
        socket.removeListener("data", onData);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(makeClient(socket));
        }
      }
    }
    socket.on("data", onData);
  });
}

function makeClient(socket) {
  let buffer = "";
  let resolver = null;

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    checkComplete();
  });

  socket.on("close", () => {
    if (resolver) {
      const r = resolver;
      resolver = null;
      r.reject(new Error("Connection closed unexpectedly"));
    }
  });

  socket.on("error", (err) => {
    if (resolver) {
      const r = resolver;
      resolver = null;
      r.reject(err);
    }
  });

  function checkComplete() {
    // SMTP multi-line responses end with "CODE " (space, not dash) before CRLF
    const lines = buffer.split(/\r\n/).filter(Boolean);
    if (lines.length === 0) return;
    const last = lines[lines.length - 1];
    const match = last.match(/^(\d{3})([ -])/);
    if (match && match[2] === " ") {
      const code = Number(match[1]);
      const text = buffer;
      buffer = "";
      if (resolver) {
        const r = resolver;
        resolver = null;
        r.resolve({ code, text });
      }
    }
  }

  function waitForResponse() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolver = null;
        reject(new Error("SMTP response timed out"));
      }, SMTP_TIMEOUT_MS);
      resolver = {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      checkComplete();
    });
  }

  async function send(line) {
    socket.write(line + "\r\n");
    return waitForResponse();
  }

  function destroy() {
    try {
      socket.destroy();
    } catch (_) {
      /* noop */
    }
  }

  return { send, destroy };
}

/**
 * Performs a full SMTP handshake against one MX host and checks whether it
 * accepts RCPT TO for `email`. Also (optionally) probes a random address on
 * the same domain to detect catch-all configurations.
 *
 * Returns: { accepted, catchAll, code, message, tempFail }
 */
async function checkMailbox(host, email, { probeCatchAll = true } = {}) {
  const client = await connect(host);
  try {
    let resp = await client.send(`EHLO ${HELO_DOMAIN}`);
    if (resp.code >= 400) {
      // Some servers are picky about EHLO; fall back to HELO
      resp = await client.send(`HELO ${HELO_DOMAIN}`);
    }

    resp = await client.send(`MAIL FROM:<${FROM_ADDRESS}>`);
    if (resp.code >= 400) {
      return { accepted: false, catchAll: false, code: resp.code, tempFail: resp.code >= 400 && resp.code < 500 };
    }

    const rcpt = await client.send(`RCPT TO:<${email}>`);
    const accepted = rcpt.code >= 200 && rcpt.code < 300;
    const tempFail = rcpt.code >= 400 && rcpt.code < 500;

    let catchAll = false;
    if (probeCatchAll && accepted) {
      const domain = email.split("@")[1];
      const randomLocal = `nonexistent-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const probe = await client.send(`RCPT TO:<${randomLocal}@${domain}>`);
      catchAll = probe.code >= 200 && probe.code < 300;
    }

    await client.send("QUIT");
    return { accepted, catchAll, code: rcpt.code, message: rcpt.text?.trim(), tempFail };
  } finally {
    client.destroy();
  }
}

module.exports = { checkMailbox };
