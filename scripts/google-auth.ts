// One-time OAuth flow. Prints a refresh token to paste into .env.
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Desktop app OAuth client).
// Add your Google account as a test user on the consent screen first.
import "dotenv/config";
import { createServer } from "node:http";
import { google } from "googleapis";
import { GOOGLE_SCOPES } from "../src/integrations/google-auth.js";

const PORT = 3001;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first");

const oauth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
const url = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // forces a refresh token even if one was issued before
  scope: GOOGLE_SCOPES,
});

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", REDIRECT);
  if (u.pathname !== "/oauth2callback") {
    res.writeHead(404).end();
    return;
  }
  const code = u.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("missing code");
    return;
  }
  try {
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error("no refresh_token returned; revoke app access and retry");
    res.end("Done. You can close this tab and return to the terminal.");
    console.log("\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
  } catch (err) {
    res.writeHead(500).end("failed");
    console.error(err);
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log("Open this URL in your browser and sign in with the demo Google account:\n");
  console.log(url + "\n");
});
