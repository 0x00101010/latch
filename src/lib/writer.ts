import fs from "fs";
import { Todo, Priority, PRIORITY_LABELS } from "./types";
import { archiveTask } from "./archiver";

function readLines(filePath: string): string[] {
  return fs.readFileSync(filePath, "utf-8").split("\n");
}

function writeLines(filePath: string, lines: string[]): void {
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

function removeTaskLines(lines: string[], lineNumber: number, lineCount: number): string[] {
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
    `${PRIORITY_LABELS[newPriority]}`
  );
  writeLines(todo.sourceFile, lines);
}
