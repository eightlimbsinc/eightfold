import { execSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

/** Applies migrations to the dedicated test database before integration tests run. */
export default function setup() {
  loadEnv({ quiet: true });
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://eightfold:eightfold@localhost:5432/eightfold_test";
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: integration tests wipe the test database.");
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
