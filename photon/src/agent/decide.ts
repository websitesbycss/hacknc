import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { findFreeSlot, listEventsBetween } from "../integrations/calendar.js";
import { sendToUser } from "../spectrum.js";
import { state, save } from "../state.js";
import { addMinutes, fmtDateTime, fmtTime } from "../utils.js";
import type { EmailAnalysis } from "./schemas.js";
import type { PendingAction } from "../types.js";

const MIN_CONFIDENCE = 0.6;
const ONE_YEAR_MS = 365 * 24 * 60 * 60_000;

function newId(): string {
  return randomBytes(2).toString("hex");
}

// Turns one email analysis into a text proposal (P0). Receipts are handled by money.ts.
export async function proposeFromEmail(
  analysis: EmailAnalysis,
  ctx: { gmailId: string; from: string; subject: string },
): Promise<void> {
  const ev = analysis.event;
  if (analysis.kind !== "event" || !ev) return;
  if (ev.confidence < MIN_CONFIDENCE) {
    console.log(`[decide] dropped event "${ev.title}" (confidence ${ev.confidence})`);
    return;
  }

  const startMs = new Date(ev.startISO).getTime();
  if (Number.isNaN(startMs)) {
    console.log(`[decide] bad start time "${ev.startISO}", skipping`);
    return;
  }
  if (startMs - Date.now() > ONE_YEAR_MS) {
    console.log(`[decide] "${ev.title}" is more than a year out, skipping`);
    return;
  }

  const startISO = ev.startISO;
  const endISO = ev.endISO ?? addMinutes(startISO, 60);
  const endMs = new Date(endISO).getTime();
  const durationMin = Math.round((endMs - startMs) / 60_000);

  // Look 30 min either side so near-misses still show up in the window
  const busy = await listEventsBetween(addMinutes(startISO, -30), addMinutes(endISO, 30));
  const conflict = busy.find(
    (b) => new Date(b.startISO).getTime() < endMs && new Date(b.endISO).getTime() > startMs,
  );

  const pending: PendingAction = {
    id: newId(),
    kind: "add_event",
    createdAt: Date.now(),
    event: { title: ev.title, startISO, endISO, location: ev.location ?? undefined },
    sourceGmailId: ctx.gmailId,
  };

  const range = `${fmtDateTime(startISO)} to ${fmtTime(endISO)}`;
  const source = `From: ${ctx.from} "${ctx.subject}"`;

  let text: string;
  if (!conflict) {
    text = `Add "${ev.title}" ${range}? No conflicts. Reply yes or no. [${pending.id}]\n${source}`;
  } else {
    const alt = await findFreeSlot(startISO, durationMin);
    if (alt) {
      pending.altEvent = alt;
      text =
        `"${ev.title}" ${fmtDateTime(startISO)} overlaps with "${conflict.title}" ` +
        `${fmtTime(conflict.startISO)} to ${fmtTime(conflict.endISO)}. ` +
        `Add anyway (yes), or move to ${fmtTime(alt.startISO)} (move), or skip (no)? [${pending.id}]\n${source}`;
    } else {
      text =
        `"${ev.title}" ${fmtDateTime(startISO)} overlaps with "${conflict.title}" and I found no free slot nearby. ` +
        `Add anyway (yes) or skip (no)? [${pending.id}]\n${source}`;
    }
  }

  state.pending.push(pending);
  save();
  console.log(`[decide] proposed ${pending.id} "${ev.title}" conflict=${Boolean(conflict)}`);
  await sendToUser(text);
}
