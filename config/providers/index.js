// const quickEmailVerification = require('./quickEmailVerification');
// const abstractApi = require('./abstractApi');
// const zeroBounce = require('./zeroBounce');
// const ownVerifier = require('./ownVerifier');

// // Order matters: first provider with quota left AND a configured API key is tried first.
// // "own" verifier never runs out of quota, so it's always the final fallback.
// function getProviderChain() {
//   return [
//     {
//       name: quickEmailVerification.name,
//       verify: quickEmailVerification.verify,
//       dailyLimit: parseInt(process.env.QEV_DAILY_LIMIT || '100', 10),
//       hasKey: () => !!process.env.QEV_API_KEY,
//     },
//     {
//       name: abstractApi.name,
//       verify: abstractApi.verify,
//       dailyLimit: parseInt(process.env.ABSTRACT_DAILY_LIMIT || '3', 10),
//       hasKey: () => !!process.env.ABSTRACT_API_KEY,
//     },
//     {
//       name: zeroBounce.name,
//       verify: zeroBounce.verify,
//       dailyLimit: parseInt(process.env.ZEROBOUNCE_DAILY_LIMIT || '3', 10),
//       hasKey: () => !!process.env.ZEROBOUNCE_API_KEY,
//     },
//     {
//       name: ownVerifier.name,
//       verify: ownVerifier.verify,
//       dailyLimit: Infinity, // unlimited, always available, no key required
//       hasKey: () => true,
//     },
//   ];
// }

// module.exports = { getProviderChain };



const quickEmailVerification = require('./quickEmailVerification');
const hunter = require('./hunter');
const verifalia = require('./verifalia');
const verifaliaAccounts = require('./verifaliaAccounts');
const ownVerifier = require('./ownVerifier');

// Order matters: first provider with quota left AND a configured API key is tried first.
// "own" verifier never runs out of quota, so it's always the final fallback.
function getProviderChain() {
  return [
    {
      name: quickEmailVerification.name,
      verify: quickEmailVerification.verify,
      dailyLimit: parseInt(process.env.QEV_DAILY_LIMIT || '100', 10),
      hasKey: () => !!process.env.QEV_API_KEY,
    },
    {
      name: hunter.name,
      verify: hunter.verify,
      dailyLimit: parseInt(process.env.HUNTER_DAILY_LIMIT || '25', 10),
      hasKey: () => !!process.env.HUNTER_API_KEY,
    },
    {
      name: verifalia.name,
      verify: verifalia.verify,
      dailyLimit: verifaliaAccounts.getVerifaliaProviderDailyLimit(),
      hasKey: () => verifaliaAccounts.getVerifaliaAccountCount() > 0,
    },
    {
      name: ownVerifier.name,
      verify: ownVerifier.verify,
      dailyLimit: Infinity, // unlimited, always available, no key required
      hasKey: () => true,
    },
  ];
}

module.exports = { getProviderChain };