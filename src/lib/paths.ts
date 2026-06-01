import { homedir } from "os";
import path from "path";

const WORKSPACE_ROOT = path.join(homedir(), "src", "workspace");

export const INBOX_PATH = path.join(WORKSPACE_ROOT, "inbox.md");
export const WORK_TODO_PATH = path.join(WORKSPACE_ROOT, "todos", "work.md");
export const PERSONAL_TODO_PATH = path.join(
  WORKSPACE_ROOT,
  "todos",
  "personal.md",
);
export const ARCHIVE_PATH = path.join(WORKSPACE_ROOT, "todos", "archive.md");
export const SCHEDULES_ROOT = path.join(WORKSPACE_ROOT, "schedules");

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function scheduleFileFor(date: Date): string {
  const year = date.getFullYear().toString();
  return path.join(SCHEDULES_ROOT, year, `${isoDate(date)}.md`);
}

export function todayScheduleFile(): string {
  return scheduleFileFor(new Date());
}
