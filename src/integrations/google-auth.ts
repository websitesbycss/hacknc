import { google } from "googleapis";
import { config } from "../config.js";

type OAuth2 = InstanceType<typeof google.auth.OAuth2>;
let client: OAuth2 | null = null;

// Shared OAuth client built from the refresh token produced by scripts/google-auth.ts
export function getOAuthClient(): OAuth2 {
  if (client) return client;
  if (!config.googleClientId || !config.googleRefreshToken) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_REFRESH_TOKEN must be set (run npm run google-auth)");
  }
  client = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret);
  client.setCredentials({ refresh_token: config.googleRefreshToken });
  return client;
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];
