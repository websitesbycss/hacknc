import { google, type gmail_v1 } from "googleapis";
import { getOAuthClient } from "./google-auth.js";

const QUERY = "newer_than:2d -category:promotions -category:social";

function gmail(): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth: getOAuthClient() });
}

export async function listNewMessages(): Promise<string[]> {
  const res = await gmail().users.messages.list({ userId: "me", q: QUERY, maxResults: 50 });
  return (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
}

export type EmailText = {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
};

function header(msg: gmail_v1.Schema$Message, name: string): string {
  return msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function findPlainText(part: gmail_v1.Schema$MessagePart | undefined): string | null {
  if (!part) return null;
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const p of part.parts ?? []) {
    const found = findPlainText(p);
    if (found) return found;
  }
  return null;
}

// Drop quoted reply text and signatures, then cap length
function cleanBody(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (line.trimStart().startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").trim().slice(0, 4000);
}

export async function getMessageText(id: string): Promise<EmailText> {
  const res = await gmail().users.messages.get({ userId: "me", id, format: "full" });
  const msg = res.data;
  return {
    id,
    subject: header(msg, "Subject"),
    from: header(msg, "From"),
    date: header(msg, "Date"),
    body: cleanBody(findPlainText(msg.payload) ?? msg.snippet ?? ""),
  };
}

