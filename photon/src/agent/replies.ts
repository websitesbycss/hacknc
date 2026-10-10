import { createEvent } from "../integrations/calendar.js";
import { sendToUser } from "../spectrum.js";
import { save, state } from "../state.js";
import { fmtDateTime } from "../utils.js";
import type { PendingAction } from "../types.js";

const YES = new Set(["yes", "y", "yep", "add", "ok", "yeah", "sure", "👍"]);
const NO = new Set(["no", "n", "skip", "nope"]);
const MOVE = new Set(["move"]);

// Parse a text reply against pending proposals (P0 reply grammar)
export async function handleReply(raw: string): Promise<void> {
  const words = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);

  // Optional id: "yes 4f2a" picks that proposal, otherwise the latest one
  const byId = state.pending.find((p) => words.includes(p.id));
  const action: PendingAction | undefined = byId ?? state.pending.at(-1);
  const verb = words.find((w) => YES.has(w) || NO.has(w) || MOVE.has(w));

  if (!action) {
    await sendToUser("Nothing pending right now.");
    return;
  }
  if (!verb) {
    await sendToUser("Reply yes, move, or no.");
    return;
  }

  state.pending = state.pending.filter((p) => p.id !== action.id);
  save();

  if (NO.has(verb)) {
    console.log(`[reply] skipped ${action.id}`);
    await sendToUser(`Skipped "${action.event.title}".`);
    return;
  }

  if (MOVE.has(verb) && !action.altEvent) {
    state.pending.push(action); // keep it open, nothing to move to
    save();
    await sendToUser(`There's no alternate time for "${action.event.title}". Reply yes or no.`);
    return;
  }

  const slot = MOVE.has(verb) && action.altEvent ? action.altEvent : action.event;
  await createEvent({
    title: action.event.title,
    startISO: slot.startISO,
    endISO: slot.endISO,
    location: action.event.location,
    description: "Added by Concierge from email",
  });
  console.log(`[reply] created ${action.id} via "${verb}"`);
  await sendToUser(`Added "${action.event.title}" ${fmtDateTime(slot.startISO)}.`);
}
