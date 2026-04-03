export type Priority = 0 | 1 | 2 | 3;

export interface Todo {
  /** Whether the task is completed */
  done: boolean;
  /** P0=Urgent, P1=High, P2=Medium, P3=Low */
  priority: Priority;
  /** Task description */
  description: string;
  /** Optional source reference (e.g. LINEAR:CHAIN-1234, GH:org/repo#123) */
  sourceRef?: string;
  /** Context lines (indented `  > text` below the task) */
  context: string[];
  /** Project/group heading this task belongs to */
  project?: string;
  /** Which file this task came from */
  sourceFile: string;
  /** Line number in the source file (1-indexed) */
  lineNumber: number;
  /** Number of lines this task occupies (task line + context lines) */
  lineCount: number;
}

export interface InboxItem {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Time string (HH:MM) */
  time: string;
  /** Raw text captured */
  text: string;
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: "P0",
  1: "P1",
  2: "P2",
  3: "P3",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  0: "#FF4444",
  1: "#FF8800",
  2: "#4488FF",
  3: "#888888",
};
