// Small built-in lists so the project works out of the box with zero network
// calls at startup. For production, replace/extend these with a maintained
// list such as https://github.com/disposable-email-domains/disposable-email-domains
// (load it into a Set at boot, same shape as below).

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com",
  "yopmail.com", "trashmail.com", "getnada.com", "sharklasers.com",
  "throwawaymail.com", "temp-mail.org", "fakeinbox.com", "maildrop.cc",
  "dispostable.com", "mintemail.com", "mailnesia.com"
]);

const FREE_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com",
  "icloud.com", "protonmail.com", "gmx.com", "zoho.com", "mail.com",
  "yandex.com", "live.com"
]);

const ROLE_LOCAL_PARTS = new Set([
  "admin", "administrator", "support", "info", "sales", "contact",
  "help", "billing", "postmaster", "webmaster", "no-reply", "noreply",
  "abuse", "security", "marketing", "hr", "jobs", "office"
]);

function isDisposable(domain) {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

function isFreeProvider(domain) {
  return FREE_PROVIDERS.has(domain.toLowerCase());
}

function isRoleAccount(localPart) {
  return ROLE_LOCAL_PARTS.has(localPart.toLowerCase());
}

module.exports = { isDisposable, isFreeProvider, isRoleAccount, DISPOSABLE_DOMAINS, FREE_PROVIDERS, ROLE_LOCAL_PARTS };
