import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

async function hashPassword() {
  const password = process.argv[2];

  if (!password) {
    console.log('Usage: npm run hash-password <password>');
    console.log('Example: npm run hash-password mySecretPassword123');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  console.log('\n=== Password Hash Generator ===\n');
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nAdd this to your .env file:');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('');
}

hashPassword().catch(console.error);
