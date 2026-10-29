import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  addOAuthServerContext,
  getOAuthState,
} from "better-auth/api";
import { db } from "./db";
import { importIdFromToken, validateGuestImport } from "./guests";
import { newUsername } from "./profiles";
const appURL = process.env.APP_URL || "http://localhost:3000";
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
  throw Error("AUTH_SECRET must contain at least 32 characters");
export const auth = betterAuth({
  appName: "Mathrix",
  baseURL: appURL,
  basePath: "/api/auth",
  secret: process.env.AUTH_SECRET,
  database: db,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path === "/sign-in/social" &&
        ctx.body?.additionalData?.guestImportIntent
      ) {
        try {
          const guestImportId = await importIdFromToken(
            ctx.body.additionalData.guestImportIntent,
          );
          await addOAuthServerContext({ guestImportId });
        } catch (e) {
          throw new APIError("BAD_REQUEST", { message: (e as Error).message });
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          try {
            let guestImportId: string | undefined;
            if (ctx?.path === "/sign-up/email" && ctx.body?.guestImportIntent)
              guestImportId = await importIdFromToken(
                ctx.body.guestImportIntent,
              );
            else if (ctx?.path?.startsWith("/callback/")) {
              const id = (await getOAuthState())?.serverContext?.guestImportId;
              if (typeof id === "string")
                guestImportId = await validateGuestImport(id);
            }
            return {
              data: {
                ...user,
                username: await newUsername(
                  user.name,
                  ctx?.path === "/sign-up/email" ? ctx.body?.handle : undefined,
                ),
                ...(guestImportId ? { guestImportId } : {}),
              },
            };
          } catch (e) {
            throw new APIError("BAD_REQUEST", {
              message: (e as Error).message,
            });
          }
        },
      },
    },
  },
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
      username: { type: "string", required: false, input: false },
      city: { type: "string", defaultValue: "", input: false },
      countryCode: { type: "string", defaultValue: "", input: false },
      avatarId: { type: "string", defaultValue: "robot-01", input: false },
      role: { type: "string", defaultValue: "USER", input: false },
      disabled: { type: "boolean", defaultValue: false, input: false },
      isGuest: { type: "boolean", defaultValue: false, input: false },
      guestImportId: {
        type: "string",
        required: false,
        input: false,
        returned: false,
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: { useSecureCookies: appURL.startsWith("https:") },
});
