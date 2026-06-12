import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit設定。M2でNeon Postgresへのマイグレーションに使用する。
 * 現時点(M1)ではマイグレーションは実行しない。
 *
 * DATABASE_URL は Neon の接続文字列を想定(例: postgres://user:pass@host/db?sslmode=require)。
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "../../drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
});
