// Run: npm run hash-password -- yourPasswordHere
// Then copy the printed hash into AUTH_PASSWORD_HASH in your .env file.
const bcrypt = require('bcryptjs');

const plainPassword = process.argv[2];

if (!plainPassword) {
  console.log('Usage: npm run hash-password -- yourPasswordHere');
  process.exit(1);
}

const hash = bcrypt.hashSync(plainPassword, 10);
console.log('\nAdd this to your .env file:\n');
console.log(`AUTH_PASSWORD_HASH=${hash}\n`);
