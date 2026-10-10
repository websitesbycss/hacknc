import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { State } from "./types.js";

const FILE = resolve(process.cwd(), "state.json");

function empty(): State {
  return {
    bootstrapped: false,
    seenGmailIds: [],
    seenPurchaseIds: [],
    pending: [],
    spendByWeek: {},
    alertsSent: [],
  };
}

function load(): State {
  if (!existsSync(FILE)) return empty();
  try {
    return { ...empty(), ...JSON.parse(readFileSync(FILE, "utf8")) };
  } catch (err) {
    console.log("[state] could not parse state.json, starting fresh", err);
    return empty();
  }
}

export const state: State = load();

// Write to a temp file then rename, so a crash mid-write never corrupts state.json.
export function save(): void {
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, FILE);
}

export function markSeen(list: string[], id: string): void {
  if (!list.includes(id)) list.push(id);
}
