/**
 * Every provider speaks a slightly different dialect:
 *   - OwnVerifier:               snake_case (mx_hosts, free_provider, catch_all...)
 *   - Hunter:                    camelCase (freeProvider, catchAll...)
 *   - QuickEmailVerification:    everything flat + a "raw" blob with its own keys
 *
 * This function is the single place that reconciles all of that into one
 * canonical shape so ResultsTable.jsx (and CSV export) never has to know
 * which provider actually answered the request.
 */
function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return !!value;
}

// Same "good enough" status set used for the frontend's verdict badge.
// Kept here too so any provider that omits `valid` entirely (like the
// current OwnVerifier, which only sets status/score/reason) still gets
// a sensible true/false value instead of silently defaulting to false.
const GOOD_STATUSES = new Set(['valid', 'deliverable', 'accept_provider_unverified']);

function normalizeResult(r) {
  const raw = r.raw || {};

  return {
    provider: r.provider,
    email: r.email,
    valid: typeof r.valid === 'boolean' ? r.valid : GOOD_STATUSES.has(r.status),
    status: r.status,
    score: r.score ?? null,
    reason: r.reason ?? null,

    syntax: r.syntax ?? true,
    domain: r.domain ?? raw.domain ?? (r.email ? r.email.split('@')[1] : null),

    mx: r.mx ?? (raw.mx_record ? true : undefined),
    mxHosts: r.mxHosts || r.mx_hosts || (raw.mx_record ? [raw.mx_record] : []),

    disposable: toBool(r.disposable ?? r.disposable_flag ?? raw.disposable ?? false),
    freeProvider: toBool(r.freeProvider ?? r.free_provider ?? raw.free ?? raw.webmail ?? false),
    roleAccount: toBool(r.roleAccount ?? r.role_account ?? raw.role ?? false),
    catchAll: toBool(r.catchAll ?? r.catch_all ?? raw.accept_all ?? false),

    smtpChecked: r.smtpChecked ?? r.smtp_checked ?? undefined,
    smtpAccepted: r.smtpAccepted ?? r.smtp_accepted ?? undefined,

    attempts: r.attempts || [],
  };
}

module.exports = { normalizeResult };