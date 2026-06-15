const { createClerkClient } = require("@clerk/backend");
const CLERK_SECRET_KEY = "sk_test_blaRQZy5SrU7UNioSMigIQ0vQqMqvXHd8vMFq0IpTE";

async function main() {
  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

  // List users
  const users = await clerk.users.getUserList({ limit: 10 });
  console.log("Clerk users:");
  for (const u of users.data) {
    console.log(`  ${u.id}: ${u.emailAddresses[0]?.emailAddress || 'no email'}`);
  }

  // Get a JWT for the first user
  if (users.data.length > 0) {
    const userId = users.data[0].id;
    // Create a testing token + session
    const { data: { token } } = await clerk.testingTokens.create();
    console.log("\nTesting token created:", token?.substring(0, 30));

    await clerk.testingTokens.claim({ userId, token });
    console.log("Token claimed for:", userId);

    await new Promise(r => setTimeout(r, 2000));
    const session = await clerk.testingTokens.createSession({ userId });
    console.log("JWT:", session.jwt?.substring(0, 50));
  }
}

main().catch(e => {
  console.error("Error:", e.message, e.stack?.substring(0, 500));
  process.exit(1);
});
