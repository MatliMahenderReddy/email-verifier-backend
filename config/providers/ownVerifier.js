// const dns = require('dns').promises;
// const net = require('net');

// const NAME = 'OwnVerifier';

// const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// // Well-known domains that reliably block/ignore SMTP RCPT probing.
// // We fall back to "MX exists" as a best-effort verdict for these.
// const SMTP_BLOCKING_DOMAINS = new Set([
//   'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
//   'yahoo.com', 'icloud.com', 'aol.com',
// ]);

// function checkSyntax(email) {
//   return EMAIL_REGEX.test(email);
// }

// function getDomain(email) {
//   return email.split('@')[1].toLowerCase();
// }

// async function getMxRecords(domain) {
//   try {
//     const records = await dns.resolveMx(domain);
//     return records.sort((a, b) => a.priority - b.priority);
//   } catch (e) {
//     return [];
//   }
// }

// // Performs a raw SMTP handshake up to RCPT TO, without actually sending an email.
// function smtpProbe(mxHost, email, fromEmail, timeoutMs) {
//   return new Promise((resolve) => {
//     let step = 0;
//     let settled = false;
//     const socket = net.createConnection(25, mxHost);

//     const commands = [
//       `HELO verifier.local\r\n`,
//       `MAIL FROM:<${fromEmail}>\r\n`,
//       `RCPT TO:<${email}>\r\n`,
//     ];

//     const finish = (result) => {
//       if (settled) return;
//       settled = true;
//       try { socket.end(); socket.destroy(); } catch (e) {}
//       resolve(result);
//     };

//     const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs);

//     socket.on('connect', () => {});

//     socket.on('data', (buf) => {
//       const line = buf.toString();
//       const code = parseInt(line.substring(0, 3), 10);

//       if (step === 0) {
//         // Server greeting (220 expected)
//         if (code === 220) {
//           socket.write(commands[0]);
//           step = 1;
//         } else {
//           clearTimeout(timer);
//           finish({ ok: false, reason: `unexpected greeting ${code}` });
//         }
//       } else if (step === 1) {
//         // HELO response (250 expected)
//         if (code === 250) {
//           socket.write(commands[1]);
//           step = 2;
//         } else {
//           clearTimeout(timer);
//           finish({ ok: false, reason: `HELO rejected ${code}` });
//         }
//       } else if (step === 2) {
//         // MAIL FROM response (250 expected)
//         if (code === 250) {
//           socket.write(commands[2]);
//           step = 3;
//         } else {
//           clearTimeout(timer);
//           finish({ ok: false, reason: `MAIL FROM rejected ${code}` });
//         }
//       } else if (step === 3) {
//         // RCPT TO response: 250 = accepted (valid), 550/551/553 = rejected (invalid)
//         clearTimeout(timer);
//         if (code === 250) {
//           finish({ ok: true, valid: true, code });
//         } else if ([550, 551, 553, 554].includes(code)) {
//           finish({ ok: true, valid: false, code });
//         } else {
//           finish({ ok: false, reason: `ambiguous RCPT response ${code}` });
//         }
//       }
//     });

//     socket.on('error', (err) => {
//       clearTimeout(timer);
//       finish({ ok: false, reason: err.message });
//     });

//     socket.on('timeout', () => {
//       clearTimeout(timer);
//       finish({ ok: false, reason: 'socket timeout' });
//     });
//   });
// }

// async function verify(email) {
//   const fromEmail = process.env.VERIFIER_FROM_EMAIL || 'verify@example.com';
//   const timeoutMs = parseInt(process.env.SMTP_TIMEOUT_MS || '8000', 10);

//   if (!checkSyntax(email)) {
//     return { provider: NAME, email, valid: false, status: 'invalid_syntax', reason: 'Malformed email address' };
//   }

//   const domain = getDomain(email);
//   const mxRecords = await getMxRecords(domain);

//   if (mxRecords.length === 0) {
//     return { provider: NAME, email, valid: false, status: 'no_mx_records', reason: 'Domain has no mail server' };
//   }

//   // Many large providers block/ratelimit anonymous SMTP probing.
//   // For those, report best-effort "domain accepts mail" rather than a false negative.
//   if (SMTP_BLOCKING_DOMAINS.has(domain)) {
//     return {
//       provider: NAME,
//       email,
//       valid: true,
//       status: 'accepted_domain_smtp_blocked',
//       reason: 'Mail server exists; this provider blocks direct SMTP probing so mailbox existence cannot be confirmed',
//     };
//   }

//   const primaryMx = mxRecords[0].exchange;
//   const probe = await smtpProbe(primaryMx, email, fromEmail, timeoutMs);

//   if (!probe.ok) {
//     // Could not get a definitive answer (e.g. port 25 blocked by your host/ISP)
//     return {
//       provider: NAME,
//       email,
//       valid: true,
//       status: 'unknown_mx_only',
//       reason: `Domain has valid mail server, but mailbox could not be confirmed (${probe.reason})`,
//     };
//   }

//   return {
//     provider: NAME,
//     email,
//     valid: probe.valid,
//     status: probe.valid ? 'valid' : 'invalid',
//     reason: probe.valid ? null : `SMTP server rejected recipient (code ${probe.code})`,
//   };
// }

// module.exports = { name: NAME, verify, checkSyntax };



const dns = require("dns").promises;
const validator = require("validator");
const { isDisposable, isFreeProvider, isRoleAccount } = require("../../utils/domains");
const { checkMailbox } = require("../../utils/smtp");
const { runQueued } = require("../../utils/domainQueue");
const { withLimit } = require("../../utils/limiter");

const NAME = "OwnVerifier";
const GREYLIST_RETRIES = Number(process.env.GREYLIST_RETRIES || 1);
const GREYLIST_RETRY_DELAY_MS = Number(process.env.GREYLIST_RETRY_DELAY_MS || 5000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Providers known to give unreliable/always-accept SMTP responses, or to
// aggressively block probing IPs. We still check MX, but we skip the RCPT TO
// step and say so in the response, rather than reporting a false result.
const SMTP_UNRELIABLE_PROVIDERS = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "mac.com",
]);

async function resolveMxHosts(domain) {
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) return [];
    return records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch (e) {
    return [];
  }
}

async function verifyEmail(rawEmail, opts = {}) {
  const email = String(rawEmail || "").trim();
  const result = {
     provider: NAME,
    email,
    syntax: false,
    domain: null,
    mx: false,
    mx_hosts: [],
    disposable: false,
    free_provider: false,
    role_account: false,
    smtp_checked: false,
    smtp_accepted: null,
    catch_all: null,
    status: "invalid",
    score: 0,
    reason: null,
  };

  // 1. Syntax (single source of truth: validator.isEmail)
  result.syntax = validator.isEmail(email);
  if (!result.syntax) {
    result.reason = "Invalid email syntax";
    return result;
  }

  const [localPart, domain] = email.split("@");
  result.domain = domain.toLowerCase();
  result.role_account = isRoleAccount(localPart);
  result.disposable = isDisposable(domain);
  result.free_provider = isFreeProvider(domain);

  if (result.disposable) {
    result.status = "undeliverable";
    result.reason = "Disposable/temporary email domain";
    result.score = 5;
    return result;
  }

  // 2. MX lookup
  const mxHosts = await resolveMxHosts(domain);
  result.mx = mxHosts.length > 0;
  result.mx_hosts = mxHosts;

  if (!result.mx) {
    result.status = "undeliverable";
    result.reason = "No MX records for domain";
    result.score = 5;
    return result;
  }

  // 3. Decide whether to attempt SMTP RCPT TO
  const skipSmtp = opts.skipSmtp || SMTP_UNRELIABLE_PROVIDERS.has(domain.toLowerCase());
  if (skipSmtp) {
    result.status = result.free_provider ? "accept_provider_unverified" : "unknown";
    result.reason = result.free_provider
      ? "This provider restricts SMTP verification (accepts most RCPT TO to prevent enumeration); only syntax + MX were checked"
      : "SMTP check skipped";
    result.score = result.free_provider ? 60 : 40;
    return result;
  }

  // 4. SMTP mailbox check, serialized per-domain and globally rate-limited
  try {
    const smtpResult = await withLimit(() =>
      runQueued(domain, () => attemptWithRetry(mxHosts, email))
    );
    result.smtp_checked = true;
    result.smtp_accepted = smtpResult.accepted;
    result.catch_all = smtpResult.catchAll;

    if (smtpResult.tempFail) {
      result.status = "unknown";
      result.reason = "Mail server temporarily rejected the check (greylisting) - retry later";
      result.score = 45;
    } else if (!smtpResult.accepted) {
      result.status = "undeliverable";
      result.reason = smtpResult.message || "Mailbox rejected by server";
      result.score = 5;
    } else if (smtpResult.catchAll) {
      result.status = "risky";
      result.reason = "Domain accepts all recipients (catch-all) - individual mailbox not confirmable";
      result.score = 55;
    } else {
      result.status = "deliverable";
      result.reason = "Mailbox confirmed by SMTP server";
      result.score = 95;
    }
  } catch (err) {
    result.status = "unknown";
    result.reason = `SMTP check failed: ${err.message}`;
    result.score = 30;
  }

  if (result.role_account && result.status === "deliverable") {
    result.score -= 15;
    result.reason += " (role-based address)";
  }

  return result;
}

async function attemptWithRetry(mxHosts, email) {
  let lastErr = null;
  for (const host of mxHosts) {
    for (let attempt = 0; attempt <= GREYLIST_RETRIES; attempt++) {
      try {
        const r = await checkMailbox(host, email);
        if (r.tempFail && attempt < GREYLIST_RETRIES) {
          await sleep(GREYLIST_RETRY_DELAY_MS);
          continue;
        }
        return r;
      } catch (err) {
        lastErr = err;
        // try next MX host
        break;
      }
    }
  }
  throw lastErr || new Error("All MX hosts unreachable");
}

// Single export. `verify` and `verifyEmail` point to the same function so
// both old (OwnVerifier-style: .verify()) and new (.verifyEmail()) callers
// work without needing two conflicting module.exports statements.
module.exports = {
  name: NAME,
  verify: verifyEmail,
  verifyEmail,
};