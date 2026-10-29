import { betterAuth } from "better-auth";
import { db } from "./db";
const appURL = process.env.APP_URL || "http://localhost:3000";
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
  throw Error("AUTH_SECRET must contain at least 32 characters");
export const auth = betterAuth({
  appName: "Mathrix",
  baseURL: appURL,
  basePath: "/api/auth",
  secret: process.env.AUTH_SECRET,
  database: db,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? {
          discord: {
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
          },
        }
      : {}),
  },
  trustedOrigins: [appURL],
  rateLimit: { enabled: true, window: 60, max: 30 },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "USER", input: false },
      disabled: { type: "boolean", defaultValue: false, input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: { useSecureCookies: appURL.startsWith("https:") },
});
