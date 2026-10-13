import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ quiet: true });

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` throws outside the React Server environment; tests run services directly.
  "server-only": fileURLToPath(new URL("./tests/support/server-only-stub.ts", import.meta.url)),
};

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://eightfold:eightfold@localhost:5432/eightfold_test";

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/support/global-setup.ts"],
          setupFiles: ["tests/support/integration-setup.ts"],
          env: { DATABASE_URL: testDatabaseUrl, NODE_ENV: "test", EMAIL_ADAPTER: "console" },
          // Integration tests share one database; run files sequentially.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
