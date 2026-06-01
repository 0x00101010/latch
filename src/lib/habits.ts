import fs from "fs";
import path from "path";
import { journalFileFor } from "./paths";

export interface Habit {
  name: string;
  cadenceRaw: string;
}

export interface HabitState {
  checked: boolean;
  paused: boolean;
  streak: number;
}

export type MilestoneTier = "" | "🌱" | "🔥" | "🔥🔥" | "⚡" | "💎" | "👑";

const HABIT_LINE_RE = /^-\s+(.+?)\s*\|\s*(.+?)\s*$/;
const HABIT_ENTRY_RE = /^-\s+(.+?):\s*(✓|✗)\s*$/;
const HABITS_HEADING_RE = /^##\s+Habits\s*\(auto\)\s*$/;
const ANY_H2_RE = /^##\s+/;

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

// Fixed anchor for `every-Nd` cadences (Monday).
const ANCHOR_EPOCH_MS = Date.UTC(2026, 0, 1);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const STREAK_MAX_LOOKBACK = 400;
const SPARKLINE_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function shiftDate(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysSinceAnchor(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((utc - ANCHOR_EPOCH_MS) / MS_PER_DAY);
}

export function parseHabitsFile(filePath: string): Habit[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const habits: Habit[] = [];
  for (const line of lines) {
    const m = line.match(HABIT_LINE_RE);
    if (!m) continue;
    const name = m[1].trim();
    const cadenceRaw = m[2].trim();
    if (!name || !cadenceRaw) continue;
    habits.push({ name, cadenceRaw });
  }
  return habits;
}

export function isDueOn(habit: Habit, date: Date): boolean {
  const c = habit.cadenceRaw.toLowerCase();
  if (c === "daily") return true;
  if (c === "first-of-month") return date.getDate() === 1;
  if (c === "last-of-month") {
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const last = new Date(next.getTime() - MS_PER_DAY);
    return date.getDate() === last.getDate();
  }
  const everyMatch = c.match(/^every-(\d+)d$/);
  if (everyMatch) {
    const n = Number(everyMatch[1]);
    if (!n || n <= 0) return false;
    const diff = daysSinceAnchor(date);
    return diff >= 0 && diff % n === 0;
  }
  // Weekday list: mon,wed,fri
  const parts = c.split(",").map((p) => p.trim());
  const wantedDows: number[] = [];
  for (const p of parts) {
    if (!(p in WEEKDAYS)) return false;
    wantedDows.push(WEEKDAYS[p]);
  }
  return wantedDows.includes(date.getDay());
}

/**
 * Read the value of a habit from a single journal file. Returns:
 *   true  → ✓ recorded
 *   false → ✗ recorded
 *   undefined → no entry (or file missing)
 */
function readHabitValue(
  date: Date,
  habit: Habit,
  journalDir?: string,
): boolean | undefined {
  const filePath = journalPathFor(date, journalDir);
  if (!fs.existsSync(filePath)) return undefined;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  let inSection = false;
  for (const line of lines) {
    if (HABITS_HEADING_RE.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (ANY_H2_RE.test(line)) break;
    const m = line.match(HABIT_ENTRY_RE);
    if (!m) continue;
    if (m[1].trim() === habit.name) return m[2] === "✓";
  }
  return undefined;
}

function journalPathFor(date: Date, journalDir?: string): string {
  if (!journalDir) return journalFileFor(date);
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return path.join(journalDir, year, month, `${year}-${month}-${day}.md`);
}

export function getHabitState(
  habit: Habit,
  today: Date,
  journalDir?: string,
): HabitState {
  const todayValue = readHabitValue(today, habit, journalDir);
  const checked = todayValue === true;

  // Walk back through prior days, collecting values for due-days only (most-recent-first).
  const prior: (boolean | undefined)[] = [];
  for (let i = 1; i <= STREAK_MAX_LOOKBACK; i++) {
    const d = shiftDate(today, -i);
    if (!isDueOn(habit, d)) continue;
    prior.push(readHabitValue(d, habit, journalDir));
    // Stop early once we've passed two non-true entries: streak can't grow further.
    if (prior.length >= 2 && prior[0] !== true && prior[1] !== true) break;
  }

  let paused = false;
  let baseStreak = 0;
  if (prior.length === 0) {
    baseStreak = 0;
  } else if (prior[0] === true) {
    for (const v of prior) {
      if (v === true) baseStreak++;
      else break;
    }
  } else if (prior.length >= 2 && prior[1] === true) {
    paused = true;
    for (let i = 1; i < prior.length; i++) {
      if (prior[i] === true) baseStreak++;
      else break;
    }
  } else {
    baseStreak = 0;
  }

  const streak = checked ? baseStreak + 1 : baseStreak;
  // If user checked today, the "yesterday miss" is no longer the latest state;
  // but per spec the warning reflects yesterday's slip, so leave paused as-is.
  return { checked, paused, streak };
}

export function milestoneTier(streak: number): MilestoneTier {
  if (streak <= 0) return "";
  if (streak <= 6) return "🌱";
  if (streak <= 20) return "🔥";
  if (streak <= 59) return "🔥🔥";
  if (streak <= 99) return "⚡";
  if (streak <= 364) return "💎";
  return "👑";
}

export function formatStreakBadge(state: HabitState): string {
  if (state.streak <= 0) return "";
  const tier = milestoneTier(state.streak);
  const base = `${tier} ${state.streak}d`;
  return state.paused ? `${base} ⚠` : base;
}

export function sparkline(
  habits: Habit[],
  today: Date,
  journalDir?: string,
): string {
  const chars: string[] = [];
  // Leftmost = 6 days ago, rightmost = today (7 days total inclusive).
  for (let offset = 6; offset >= 0; offset--) {
    const d = shiftDate(today, -offset);
    let due = 0;
    let done = 0;
    for (const h of habits) {
      if (!isDueOn(h, d)) continue;
      due++;
      if (readHabitValue(d, h, journalDir) === true) done++;
    }
    if (due === 0) {
      chars.push("·");
      continue;
    }
    const pct = (done / due) * 100;
    // 8 levels mapped via floor(pct / 12.5), clamped to 0..7.
    let level = Math.floor(pct / 12.5);
    if (level > 7) level = 7;
    if (level < 0) level = 0;
    chars.push(SPARKLINE_BLOCKS[level]);
  }
  return chars.join("");
}

export interface TodaySummary {
  due: number;
  done: number;
}

export function todaySummary(
  habits: Habit[],
  today: Date,
  journalDir?: string,
): TodaySummary {
  let due = 0;
  let done = 0;
  for (const h of habits) {
    if (!isDueOn(h, today)) continue;
    due++;
    if (readHabitValue(today, h, journalDir) === true) done++;
  }
  return { due, done };
}
