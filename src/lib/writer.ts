import fs from "fs";
import path from "path";
import { Todo, Priority, PRIORITY_LABELS } from "./types";
import { archiveTask } from "./archiver";
import { parseTodoFile } from "./parser";
import { scheduleFileFor, todayScheduleFile, journalFileFor } from "./paths";
import { Habit } from "./habits";

function readLines(filePath: string): string[] {
  return fs.readFileSync(filePath, "utf-8").split("\n");
}

function writeLines(filePath: string, lines: string[]): void {
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

function removeTaskLines(
  lines: string[],
  lineNumber: number,
  lineCount: number,
): string[] {
  const idx = lineNumber - 1;
  return [...lines.slice(0, idx), ...lines.slice(idx + lineCount)];
}

export function completeAndArchive(todo: Todo): void {
  const lines = readLines(todo.sourceFile);
  const updated = removeTaskLines(lines, todo.lineNumber, todo.lineCount);
  writeLines(todo.sourceFile, updated);
  archiveTask(todo);
}

export function deleteTask(todo: Todo): void {
  const lines = readLines(todo.sourceFile);
  const updated = removeTaskLines(lines, todo.lineNumber, todo.lineCount);
  writeLines(todo.sourceFile, updated);
}

export function cyclePriority(todo: Todo): void {
  const lines = readLines(todo.sourceFile);
  const idx = todo.lineNumber - 1;
  const newPriority = ((todo.priority + 1) % 4) as Priority;
  lines[idx] = lines[idx].replace(
    `${PRIORITY_LABELS[todo.priority]}`,
    `${PRIORITY_LABELS[newPriority]}`,
  );
  writeLines(todo.sourceFile, lines);
}

function dayLabel(date: Date): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function buildTaskLine(todo: Todo): string {
  let line = `- [ ] ${PRIORITY_LABELS[todo.priority]} | ${todo.description}`;
  if (todo.sourceRef) line += ` | ${todo.sourceRef}`;
  return line;
}

function buildTaskBlock(todo: Todo): string[] {
  const block = [buildTaskLine(todo)];
  for (const ctx of todo.context) block.push(`  > ${ctx}`);
  return block;
}

/**
 * Mark the matching schedule line as [x]. If `todo.sourceRef` matches a row
 * in any of the given todo files, also archive that row via `completeAndArchive`.
 */
export function completeScheduleItem(todo: Todo, todoFiles: string[]): void {
  const lines = readLines(todo.sourceFile);
  const idx = todo.lineNumber - 1;
  lines[idx] = lines[idx].replace("- [ ]", "- [x]");
  writeLines(todo.sourceFile, lines);

  if (!todo.sourceRef) return;
  for (const file of todoFiles) {
    const candidates = parseTodoFile(file);
    const match = candidates.find(
      (t) => !t.done && t.sourceRef === todo.sourceRef,
    );
    if (match) {
      completeAndArchive(match);
      return;
    }
  }
}

function ensureScheduleFile(filePath: string, date: Date): void {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `# ${dayLabel(date)}\n`, "utf-8");
}

function findSectionHeading(lines: string[], section: string): number {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+)$/);
    if (!m) continue;
    const raw = m[1].trim();
    if (raw === section) return i;
    const afternoon = raw.match(/^Afternoon\s+[—–-]\s+(.+)$/);
    if (afternoon && afternoon[1].trim() === section) return i;
  }
  return -1;
}

function appendSection(
  lines: string[],
  headingLine: string,
  block: string[],
): string[] {
  const out = [...lines];
  if (out.length > 0 && out[out.length - 1] !== "") out.push("");
  out.push(headingLine);
  out.push("");
  for (const l of block) out.push(l);
  return out;
}

function insertAtSectionEnd(
  lines: string[],
  headingIdx: number,
  block: string[],
): string[] {
  // Find end of section (next `## ` heading or EOF). Insert block before that, after the last
  // non-blank line in the section.
  let end = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  // Trim trailing blanks within the section
  let insertAt = end;
  while (insertAt > headingIdx + 1 && lines[insertAt - 1].trim() === "")
    insertAt--;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  // Ensure a blank between heading content and new block if heading immediately precedes
  const needsLeadingBlank =
    before.length > 0 && before[before.length - 1].trim() !== "";
  const prefix = needsLeadingBlank ? [""] : [];
  return [
    ...before,
    ...prefix,
    ...block,
    ...(after.length === 0 ? [""] : after),
  ];
}

/**
 * Copy the task (line + context) into tomorrow's schedule, under the same section as
 * the original. Creates tomorrow's file from a skeleton if missing. Does NOT modify
 * the original schedule file.
 */
export function deferToTomorrow(todo: Todo): void {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const targetPath = scheduleFileFor(tomorrow);
  ensureScheduleFile(targetPath, tomorrow);

  const section = todo.project ?? "Trickle";
  const lines = fs.readFileSync(targetPath, "utf-8").split("\n");
  const block = buildTaskBlock(todo);

  // Recover the original heading text from today's file (so `Afternoon — Project` stays intact).
  const headingForSection = (() => {
    const todayLines = fs.readFileSync(todo.sourceFile, "utf-8").split("\n");
    for (const line of todayLines) {
      const m = line.match(/^##\s+(.+)$/);
      if (!m) continue;
      const raw = m[1].trim();
      if (raw === section) return `## ${raw}`;
      const afternoon = raw.match(/^Afternoon\s+[—–-]\s+(.+)$/);
      if (afternoon && afternoon[1].trim() === section) return `## ${raw}`;
    }
    return `## ${section}`;
  })();

  const headingIdx = findSectionHeading(lines, section);
  const updated =
    headingIdx === -1
      ? appendSection(lines, headingForSection, block)
      : insertAtSectionEnd(lines, headingIdx, block);
  writeLines(targetPath, updated);
}

function ensureJournalFile(filePath: string, date: Date): void {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const skeleton = [
    `# Journal — ${dayLabel(date)}`,
    "",
    "## Habits (auto)",
    "",
    "## Notes",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, skeleton, "utf-8");
}

/**
 * Toggle the ✓/✗ state of a habit in `<date>`'s journal `## Habits (auto)` section.
 * Creates the journal file (with skeleton) and/or the section if missing. Preserves
 * all other content byte-for-byte (especially `## Notes`).
 */
export function toggleHabit(habit: Habit, date: Date): void {
  const filePath = journalFileFor(date);
  ensureJournalFile(filePath, date);

  const lines = readLines(filePath);
  // Locate the `## Habits (auto)` section bounds.
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Habits\s*\(auto\)\s*$/.test(lines[i])) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) {
    // Insert section just after the H1 (or at top if no H1).
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^#\s+/.test(lines[i])) {
        insertAt = i + 1;
        break;
      }
    }
    const block = ["", "## Habits (auto)", `- ${habit.name}: ✓`];
    lines.splice(insertAt, 0, ...block);
    writeLines(filePath, lines);
    return;
  }

  // Section end: next `## ` heading or EOF.
  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  // Look for the habit line within the section.
  const habitLineRe = /^-\s+(.+?):\s*(✓|✗)\s*$/;
  let habitLineIdx = -1;
  for (let i = headingIdx + 1; i < endIdx; i++) {
    const m = lines[i].match(habitLineRe);
    if (m && m[1].trim() === habit.name) {
      habitLineIdx = i;
      break;
    }
  }

  if (habitLineIdx !== -1) {
    const m = lines[habitLineIdx].match(habitLineRe)!;
    const next = m[2] === "✓" ? "✗" : "✓";
    lines[habitLineIdx] = `- ${habit.name}: ${next}`;
    writeLines(filePath, lines);
    return;
  }

  // Insert new habit entry after the last non-blank line within the section.
  let insertAt = endIdx;
  while (insertAt > headingIdx + 1 && lines[insertAt - 1].trim() === "")
    insertAt--;
  lines.splice(insertAt, 0, `- ${habit.name}: ✓`);
  writeLines(filePath, lines);
}

/**
 * Append a todo to today's schedule under a `## Overlooked` section, creating the
 * schedule file and/or section if needed.
 */
export function addToTodaySchedule(todo: Todo): void {
  const today = new Date();
  const targetPath = todayScheduleFile();
  ensureScheduleFile(targetPath, today);

  const lines = fs.readFileSync(targetPath, "utf-8").split("\n");
  const block = buildTaskBlock(todo);
  const headingIdx = findSectionHeading(lines, "Overlooked");
  const updated =
    headingIdx === -1
      ? appendSection(lines, "## Overlooked", block)
      : insertAtSectionEnd(lines, headingIdx, block);
  writeLines(targetPath, updated);
}
