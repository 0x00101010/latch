import fs from "fs";
import { Todo } from "./types";
import { ARCHIVE_PATH } from "./paths";
import { PRIORITY_LABELS } from "./types";

export function archiveTask(todo: Todo): void {
  const today = new Date().toISOString().slice(0, 10);
  const monthHeader = `## ${today.slice(0, 7).replace("-", "-")}`;

  let archiveLine = `- [x] ${PRIORITY_LABELS[todo.priority]} | ${todo.description}`;
  if (todo.sourceRef) archiveLine += ` | ${todo.sourceRef}`;
  archiveLine += ` | ${today}`;

  const contextLines = todo.context.map((c) => `  > ${c}`).join("\n");
  const entry = contextLines ? `${archiveLine}\n${contextLines}` : archiveLine;

  if (!fs.existsSync(ARCHIVE_PATH)) {
    fs.writeFileSync(ARCHIVE_PATH, `# Archive\n\n${monthHeader}\n\n${entry}\n`, "utf-8");
    return;
  }

  const content = fs.readFileSync(ARCHIVE_PATH, "utf-8");

  if (content.includes(monthHeader)) {
    const headerIdx = content.indexOf(monthHeader);
    const insertIdx = headerIdx + monthHeader.length + 1;
    const updated = content.slice(0, insertIdx) + `\n${entry}` + content.slice(insertIdx);
    fs.writeFileSync(ARCHIVE_PATH, updated, "utf-8");
  } else {
    const headerLine = content.indexOf("\n") + 1;
    const updated =
      content.slice(0, headerLine) + `\n${monthHeader}\n\n${entry}\n` + content.slice(headerLine);
    fs.writeFileSync(ARCHIVE_PATH, updated, "utf-8");
  }
}
