import { config } from "./config.js";

const pad = (n: number) => String(n).padStart(2, "0");

// "Fri, Oct 16, 7:00 PM" in the configured timezone
export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: config.tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

// "7:00 PM" in the configured timezone
export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: config.tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Calendar-date parts for a Date in the configured timezone
function localParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

// Monday = 1 ... Sunday = 7
export function isoDow(d: Date = new Date()): number {
  const { y, m, d: day } = localParts(d);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function localDateKey(d: Date = new Date()): string {
  const { y, m, d: day } = localParts(d);
  return `${y}-${pad(m)}-${pad(day)}`;
}

// ISO week key like "2026-W41", computed in the configured timezone
export function isoWeekKey(d: Date = new Date()): string {
  const { y, m, d: day } = localParts(d);
  const utc = Date.UTC(y, m - 1, day);
  const dow = isoDow(d);
  const thursday = new Date(utc + (4 - dow) * 86400000);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - jan1) / 86400000 + 1) / 7);
  return `${year}-W${pad(week)}`;
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
