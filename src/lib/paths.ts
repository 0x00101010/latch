import { homedir } from "os";
import path from "path";

const WORKSPACE_ROOT = path.join(homedir(), "src", "workspace");

export const INBOX_PATH = path.join(WORKSPACE_ROOT, "inbox.md");
export const WORK_TODO_PATH = path.join(WORKSPACE_ROOT, "todos", "work.md");
export const PERSONAL_TODO_PATH = path.join(WORKSPACE_ROOT, "todos", "personal.md");
export const ARCHIVE_PATH = path.join(WORKSPACE_ROOT, "todos", "archive.md");
