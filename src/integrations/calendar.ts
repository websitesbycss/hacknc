import { google, type calendar_v3 } from "googleapis";
import { config } from "../config.js";
import { getOAuthClient } from "./google-auth.js";

function cal(): calendar_v3.Calendar {
  return google.calendar({ version: "v3", auth: getOAuthClient() });
}

export type Busy = { title: string; startISO: string; endISO: string };

// Timed events on the primary calendar that overlap [startISO, endISO]
export async function listEventsBetween(startISO: string, endISO: string): Promise<Busy[]> {
  const res = await cal().events.list({
    calendarId: "primary",
    timeMin: startISO,
    timeMax: endISO,
    singleEvents: true,
    orderBy: "startTime",
  });
  const out: Busy[] = [];
  for (const e of res.data.items ?? []) {
    // Skip all-day events (they have `date`, not `dateTime`)
    if (!e.start?.dateTime || !e.end?.dateTime) continue;
    out.push({ title: e.summary ?? "(untitled)", startISO: e.start.dateTime, endISO: e.end.dateTime });
  }
  console.log(`[calendar] ${out.length} event(s) between ${startISO} and ${endISO}`);
  return out;
}

const overlaps = (aStart: number, aEnd: number, b: Busy) =>
  aStart < new Date(b.endISO).getTime() && aEnd > new Date(b.startISO).getTime();

// Try the same start, then +30min steps for up to 4h, returning the first window that's free
export async function findFreeSlot(
  startISO: string,
  durationMin: number,
): Promise<{ startISO: string; endISO: string } | null> {
  const start = new Date(startISO).getTime();
  const windowEnd = start + 4 * 60 * 60_000 + durationMin * 60_000;
  const busy = await listEventsBetween(startISO, new Date(windowEnd).toISOString());
  for (let off = 30; off <= 240; off += 30) {
    const s = start + off * 60_000;
    const e = s + durationMin * 60_000;
    if (!busy.some((b) => overlaps(s, e, b))) {
      return { startISO: new Date(s).toISOString(), endISO: new Date(e).toISOString() };
    }
  }
  return null;
}

export async function createEvent(args: {
  title: string;
  startISO: string;
  endISO: string;
  location?: string;
  description?: string;
}): Promise<string | undefined> {
  const res = await cal().events.insert({
    calendarId: "primary",
    requestBody: {
      summary: args.title,
      location: args.location,
      description: args.description ?? "Added by Concierge",
      start: { dateTime: args.startISO, timeZone: config.tz },
      end: { dateTime: args.endISO, timeZone: config.tz },
    },
  });
  console.log(`[calendar] created "${args.title}" ${args.startISO} (${res.data.id})`);
  return res.data.id ?? undefined;
}
