import { config } from "dotenv";

config();

const bool = (value: string | undefined, fallback = false) => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
};

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const requiredEnvVars: Array<keyof typeof process.env> = ["SESSION_SECRET"];

const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(
    `⚠️ Missing required environment variables: ${missing.join(
      ", "
    )}. Using fallback dev values.`
  );
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: num(process.env.APP_PORT, 3000),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  trustProxy: bool(process.env.TRUST_PROXY),
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  logLevel: process.env.LOG_LEVEL ?? "dev"
};

export const isProd = env.nodeEnv === "production";
export const isDev = !isProd;

