import { afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/server/db";

if (!process.env.DATABASE_URL || process.env.DATABASE_URL === process.env.DEV_DATABASE_URL_GUARD) {
  throw new Error("Integration tests require DATABASE_URL to point at the test database.");
}
if (!/test/i.test(new URL(process.env.DATABASE_URL).pathname)) {
  throw new Error(`Refusing to run integration tests against non-test database ${new URL(process.env.DATABASE_URL).pathname}`);
}

// Keep console-adapter email output out of the test log.
vi.spyOn(console, "info").mockImplementation(() => {});

beforeEach(async () => {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
