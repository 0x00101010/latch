import fs from "fs";
import { Todo, Priority } from "./types";

const TASK_RE = /^- \[([ x])\] P([0-3]) \| (.+?)(?:\s*\|\s*(.+))?$/;
const CONTEXT_RE = /^  > (.+)$/;
const HEADING_RE = /^### (.+)$/;

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

    const taskMatch = lines[i].match(TASK_RE);
    if (!taskMatch) continue;

    const context: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const ctxMatch = lines[j].match(CONTEXT_RE);
      if (!ctxMatch) break;
      context.push(ctxMatch[1]);
      j++;
    }

    const rest = taskMatch[4]?.trim();
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

    todos.push({
      done: taskMatch[1] === "x",
      priority: Number(taskMatch[2]) as Priority,
      description: taskMatch[3].trim(),
      sourceRef,
      context,
      project: currentProject,
      sourceFile: filePath,
      lineNumber: i + 1,
      lineCount: 1 + context.length,
    });
  }

  return todos;
}

export function loadAllTodos(workPath: string, personalPath: string): Todo[] {
  return [...parseTodoFile(workPath), ...parseTodoFile(personalPath)];
}
