import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { config } from "../config.js";
import { localDateKey } from "../utils.js";
import { EmailAnalysis, VoiceMemoAnalysis } from "./schemas.js";
import type { EmailText } from "../integrations/gmail.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

function nowContext(): string {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: config.tz, weekday: "long" }).format(now);
  return `Current local date: ${localDateKey(now)} (${weekday}), timezone ${config.tz}. Resolve relative dates like "Friday at 7" against this.`;
}

// One structured Gemini call. Returns null (never throws) when output is unusable,
// so a bad response only skips that item instead of crashing a poller.
async function generateJson<T>(
  label: string,
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
  schema: z.ZodType<T>,
  jsonSchema: unknown,
): Promise<T | null> {
  try {
    const res = await ai.models.generateContent({
      model: config.geminiModel,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
      },
    });
    const raw = JSON.parse(res.text ?? "");
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      console.log(`[gemini] ${label} failed validation`, parsed.error.issues.slice(0, 3));
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.log(`[gemini] ${label} error, skipping`, err);
    return null;
  }
}

const EMAIL_SYSTEM = `You extract calendar events and receipts from a single email for a personal assistant.
- kind "event" only if the email proposes or confirms a specific future date and time the user would plausibly want on their calendar. Ignore newsletters, marketing, and past events.
- kind "receipt" only for an actual completed charge with a dollar amount.
- If unsure, kind "other".
- startISO must include a timezone offset.
- confidence is 0..1 for the event.`;

export async function analyzeEmail(email: EmailText): Promise<EmailAnalysis | null> {
  const text = [
    EMAIL_SYSTEM,
    nowContext(),
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    `Date: ${email.date}`,
    `Body:\n${email.body}`,
  ].join("\n\n");
  const result = await generateJson("analyzeEmail", [{ text }], EmailAnalysis, z.toJSONSchema(EmailAnalysis));
  console.log(`[gemini] email "${email.subject}" -> ${result?.kind ?? "failed"}`);
  return result;
}

export async function analyzeVoiceMemo(audio: Buffer, mimeType: string): Promise<VoiceMemoAnalysis | null> {
  const prompt = [
    "Transcribe this voice memo internally, then return JSON.",
    nowContext(),
    "summary: at most 3 short bullets.",
    "actionItems: concrete to-dos, with dueISO (with offset) when a time is stated, else null.",
    "moneyOwed: anyone the speaker says owes money or who is owed money, with amount and reason.",
  ].join("\n");
  const result = await generateJson(
    "analyzeVoiceMemo",
    [{ inlineData: { mimeType, data: audio.toString("base64") } }, { text: prompt }],
    VoiceMemoAnalysis,
    z.toJSONSchema(VoiceMemoAnalysis),
  );
  console.log(`[gemini] voice memo -> ${result ? `${result.actionItems.length} action item(s)` : "failed"}`);
  return result;
}
