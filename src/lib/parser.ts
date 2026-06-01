import fs from "fs";
import { Todo, Priority } from "./types";

// Matches both the todo-file format (`- [ ] P1 | desc`) and the
// schedule-file format (`- [ ] **P1** - desc`).
const TASK_RE =
  /^- \[([ x])\] (?:\*\*P([0-3])\*\*\s*-\s*|P([0-3])\s*\|\s*)(.+?)(?:\s*\|\s*(.+))?$/;
const CONTEXT_RE = /^  > (.+)$/;
const HEADING_RE = /^### (.+)$/;
const SCHEDULE_HEADING_RE = /^##\s+(.+)$/;

function parseTaskLine(
  lines: string[],
  i: number,
  currentProject: string | undefined,
  filePath: string,
): Todo | null {
  const taskMatch = lines[i].match(TASK_RE);
  if (!taskMatch) return null;

  const context: string[] = [];
  let j = i + 1;
  while (j < lines.length) {
    const ctxMatch = lines[j].match(CONTEXT_RE);
    if (!ctxMatch) break;
    context.push(ctxMatch[1]);
    j++;
  }

  const rest = taskMatch[5]?.trim();
  let sourceRef: string | undefined;

  // Last pipe-separated segment could be a source ref (LINEAR:, GH:) or a date — not a source ref
  if (rest && /^(LINEAR:|GH:)/.test(rest)) {
    sourceRef = rest;
  } else if (rest) {
    // Could be "GH:xxx | 2026-04-03" (archived) or just a ref
    const parts = rest.split(/\s*\|\s*/);
    for (const part of parts) {
      if (/^(LINEAR:|GH:)/.test(part)) {
        sourceRef = part;
        break;
      }
    }
  }

  return {
    done: taskMatch[1] === "x",
    priority: Number(taskMatch[2] ?? taskMatch[3]) as Priority,
    description: taskMatch[4].trim(),
    sourceRef,
    context,
    project: currentProject,
    sourceFile: filePath,
    lineNumber: i + 1,
    lineCount: 1 + context.length,
  };
}

export function parseTodoFile(filePath: string): Todo[] {
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const todos: Todo[] = [];
  let currentProject: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(HEADING_RE);
    if (headingMatch) {
      currentProject = headingMatch[1].trim();
      continue;
    }

    const todo = parseTaskLine(lines, i, currentProject, filePath);
    if (todo) todos.push(todo);
  }

  return todos;
}

export function loadAllTodos(workPath: string, personalPath: string): Todo[] {
  return [...parseTodoFile(workPath), ...parseTodoFile(personalPath)];
}

export interface ParsedSchedule {
  tasks: Todo[];
  alignment: string;
  sectionOrder: string[];
}

export function parseScheduleFile(filePath: string): ParsedSchedule {
  if (!fs.existsSync(filePath)) {
    return { tasks: [], alignment: "", sectionOrder: [] };
  }

  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const tasks: Todo[] = [];
  const sectionOrder: string[] = [];
  let currentSection: string | undefined;
  let alignmentLines: string[] = [];
  let inAlignment = false;

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(SCHEDULE_HEADING_RE);
    if (headingMatch) {
      const raw = headingMatch[1].trim();
      if (/^Alignment\b/i.test(raw)) {
        inAlignment = true;
        currentSection = undefined;
        continue;
      }
      inAlignment = false;
      // For "Afternoon — Project", use the project name after the em dash.
      const afternoonMatch = raw.match(/^Afternoon\s+[—–-]\s+(.+)$/);
      currentSection = afternoonMatch ? afternoonMatch[1].trim() : raw;
      if (!sectionOrder.includes(currentSection))
        sectionOrder.push(currentSection);
      continue;
    }

    if (inAlignment) {
      alignmentLines.push(lines[i]);
      continue;
    }

    const todo = parseTaskLine(lines, i, currentSection, filePath);
    if (todo) tasks.push(todo);
  }

  // Trim leading/trailing blank lines from alignment.
  while (alignmentLines.length && alignmentLines[0].trim() === "")
    alignmentLines.shift();
  while (
    alignmentLines.length &&
    alignmentLines[alignmentLines.length - 1].trim() === ""
  )
    alignmentLines.pop();

  return { tasks, alignment: alignmentLines.join("\n"), sectionOrder };
}
