import fs from "fs";
import { Todo } from "./types";
import { parseScheduleFile } from "./parser";
import { scheduleFileFor } from "./paths";

const MAX_SLIP_LOOKBACK = 30;

function matchesTodo(candidate: Todo, target: Todo): boolean {
  if (target.sourceRef && candidate.sourceRef === target.sourceRef) return true;
  if (!target.sourceRef && !candidate.sourceRef)
    return candidate.description === target.description;
  return false;
}

function shiftDate(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Walk back day-by-day through schedule files. Count consecutive prior days where a
 * matching unchecked task appears. Stop at the first day without a match. Today is
 * not counted; 0 means today is the first appearance.
 */
export function computeSlipAge(todo: Todo, today: Date): number {
  let age = 0;
  for (let i = 1; i <= MAX_SLIP_LOOKBACK; i++) {
    const prev = shiftDate(today, -i);
    const file = scheduleFileFor(prev);
    if (!fs.existsSync(file)) break;
    const { tasks } = parseScheduleFile(file);
    const hit = tasks.find((t) => !t.done && matchesTodo(t, todo));
    if (!hit) break;
    age += 1;
  }
  return age;
}

/**
 * Find P0/P1 work/personal todos whose sourceRef or description hasn't appeared in any
 * schedule for the past `lookback` days (default 7).
 */
export function findOverlooked(
  workTodos: Todo[],
  today: Date,
  lookback: number = 7,
): Todo[] {
  const recentRefs = new Set<string>();
  const recentDescs = new Set<string>();
  for (let i = 0; i < lookback; i++) {
    const file = scheduleFileFor(shiftDate(today, -i));
    if (!fs.existsSync(file)) continue;
    const { tasks } = parseScheduleFile(file);
    for (const t of tasks) {
      if (t.sourceRef) recentRefs.add(t.sourceRef);
      recentDescs.add(t.description);
    }
  }

  return workTodos.filter((todo) => {
    if (todo.done) return false;
    if (todo.priority > 1) return false;
    if (todo.sourceRef && recentRefs.has(todo.sourceRef)) return false;
    if (recentDescs.has(todo.description)) return false;
    return true;
  });
}

export interface YesterdayStats {
  done: number;
  total: number;
  deferredOut: number;
  chronicMax: number;
}

/**
 * Compute mechanical stats from yesterday's schedule:
 * - done/total task counts
 * - deferredOut: items whose copy shows up in today's schedule
 * - chronicMax: maximum slip age across yesterday's tasks
 */
export function computeYesterdayStats(today: Date): YesterdayStats | null {
  const yesterday = shiftDate(today, -1);
  const ydayFile = scheduleFileFor(yesterday);
  if (!fs.existsSync(ydayFile)) return null;
  const { tasks: ydayTasks } = parseScheduleFile(ydayFile);
  if (ydayTasks.length === 0) {
    return { done: 0, total: 0, deferredOut: 0, chronicMax: 0 };
  }

  const todayFile = scheduleFileFor(today);
  const todayTasks = fs.existsSync(todayFile)
    ? parseScheduleFile(todayFile).tasks
    : [];

  let done = 0;
  let deferredOut = 0;
  let chronicMax = 0;
  for (const t of ydayTasks) {
    if (t.done) done += 1;
    else {
      const carried = todayTasks.find((x) => matchesTodo(x, t));
      if (carried) deferredOut += 1;
    }
    const slip = computeSlipAge(t, yesterday);
    if (slip > chronicMax) chronicMax = slip;
  }

  return { done, total: ydayTasks.length, deferredOut, chronicMax };
}
