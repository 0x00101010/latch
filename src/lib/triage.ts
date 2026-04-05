import fs from "fs";
import { AI, Toast } from "@raycast/api";
import { INBOX_PATH, WORK_TODO_PATH, PERSONAL_TODO_PATH } from "./paths";

const INBOX_ITEM_RE = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} \| (.+)$/;
const CONTEXT_RE = /^  > (.+)$/;
const HEADING_RE = /^### (.+)$/;

export interface InboxEntry {
  title: string;
  context: string[];
  /** Source of this entry */
  source: "local" | "github";
  /** Line range in inbox.md (local entries only) */
  startLine: number;
  endLine: number;
  /** GitHub Issue number (github entries only) */
  issueNumber?: number;
}

export interface TriageResult {
  category: string;
  priority: string;
  confidence: number;
  description: string;
  source_ref?: string;
  context?: string[];
}

export function parseInbox(): InboxEntry[] {
  if (!fs.existsSync(INBOX_PATH)) return [];
  const lines = fs.readFileSync(INBOX_PATH, "utf-8").split("\n");
  const entries: InboxEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(INBOX_ITEM_RE);
    if (!match) continue;

    const context: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const ctxMatch = lines[j].match(CONTEXT_RE);
      if (!ctxMatch) break;
      context.push(ctxMatch[1]);
      j++;
    }

    entries.push({
      title: match[1].trim(),
      context,
      source: "local",
      startLine: i,
      endLine: j - 1,
    });
  }

  return entries;
}

export function extractWorkCategories(): {
  categories: string[];
  recentTasks: string[];
} {
  if (!fs.existsSync(WORK_TODO_PATH))
    return { categories: [], recentTasks: [] };
  const content = fs.readFileSync(WORK_TODO_PATH, "utf-8");
  const lines = content.split("\n");

  const categories: string[] = [];
  const recentTasks: string[] = [];
  const taskRe = /^- \[[ x]\] (P[0-3] \| .+?)$/;

  for (const line of lines) {
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      categories.push(headingMatch[1].trim());
      continue;
    }
    const taskMatch = line.match(taskRe);
    if (taskMatch && recentTasks.length < 8) {
      recentTasks.push(taskMatch[1]);
    }
  }

  return { categories, recentTasks };
}

export function buildTriagePrompt(
  entry: InboxEntry,
  categories: string[],
  recentTasks: string[],
): string {
  const contextStr =
    entry.context.length > 0 ? entry.context.join("\n") : "(none)";

  return `You are a task categorizer for a software engineer's personal productivity system.

WORK CATEGORIES (from current work.md):
${categories.map((c) => `- ${c}`).join("\n")}

PERSONAL: Non-work tasks (household, errands, health, etc.)

RECENT TASKS (for style/context):
${recentTasks.map((t) => `- ${t}`).join("\n")}

RULES:
- Match to existing categories. Never invent new ones.
- If genuinely unclear, set confidence below 0.8.
- Clean up the description: fix typos, normalize casing, remove filler words.
- Infer priority: "urgent"/"blocker"/"asap" → P0, "important"/"review" → P1, default → P2, "later"/"someday" → P3.
- If the text contains a URL (github.com, linear.app), extract it as source_ref using format LINEAR:ID or GH:org/repo#num.

TASK TO CATEGORIZE:
Title: "${entry.title}"
Context: "${contextStr}"

RULES FOR CONTEXT:
- Use context lines to improve categorization accuracy (URLs, keywords, project references)
- Preserve context when routing — return them in the context array
- If context contains a URL (github.com, linear.app), extract it as source_ref

Respond in JSON only, no explanation:
{"category":"CategoryName","priority":"P2","confidence":0.92,"description":"Cleaned task description","source_ref":"LINEAR:CHAIN-1234","context":["preserved context line 1"]}`;
}

export function parseTriageResponse(raw: string): TriageResult | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (
      !parsed.category ||
      !parsed.priority ||
      typeof parsed.confidence !== "number"
    )
      return null;
    return {
      category: parsed.category,
      priority: parsed.priority,
      confidence: parsed.confidence,
      description: parsed.description || "",
      source_ref: parsed.source_ref || undefined,
      context: Array.isArray(parsed.context) ? parsed.context : undefined,
    };
  } catch {
    return null;
  }
}

export function routeTask(result: TriageResult): void {
  const isPersonal = result.category.toLowerCase() === "personal";
  const targetPath = isPersonal ? PERSONAL_TODO_PATH : WORK_TODO_PATH;

  let taskLine = `- [ ] ${result.priority} | ${result.description}`;
  if (result.source_ref) taskLine += ` | ${result.source_ref}`;

  const contextLines = (result.context ?? []).map((c) => `  > ${c}`).join("\n");
  const entry = contextLines ? `${taskLine}\n${contextLines}` : taskLine;

  const content = fs.readFileSync(targetPath, "utf-8");

  if (isPersonal) {
    fs.writeFileSync(
      targetPath,
      content.trimEnd() + "\n" + entry + "\n",
      "utf-8",
    );
    return;
  }

  const headingPattern = `### ${result.category}`;
  const headingIdx = content.indexOf(headingPattern);

  if (headingIdx === -1) {
    fs.writeFileSync(
      targetPath,
      content.trimEnd() + "\n\n### " + result.category + "\n\n" + entry + "\n",
      "utf-8",
    );
    return;
  }

  const afterHeading = headingIdx + headingPattern.length;
  const nextHeadingIdx = content.indexOf("\n###", afterHeading);
  const insertAt = nextHeadingIdx === -1 ? content.length : nextHeadingIdx;

  const before = content.slice(0, insertAt).trimEnd();
  const after = content.slice(insertAt);
  fs.writeFileSync(targetPath, before + "\n" + entry + after, "utf-8");
}

export function removeProcessedEntries(entries: InboxEntry[]): void {
  if (entries.length === 0) return;
  const content = fs.readFileSync(INBOX_PATH, "utf-8");
  const lines = content.split("\n");

  const removeLines = new Set<number>();
  for (const entry of entries) {
    for (let i = entry.startLine; i <= entry.endLine; i++) {
      removeLines.add(i);
    }
  }

  const remaining = lines.filter((_, i) => !removeLines.has(i));
  fs.writeFileSync(INBOX_PATH, remaining.join("\n"), "utf-8");
}

export interface TriageOutcome {
  processedCount: number;
  lowConfidenceCount: number;
}

export async function triageInbox(
  manual: boolean,
  toast?: Toast,
): Promise<TriageOutcome> {
  const entries = parseInbox();

  if (entries.length === 0) {
    return { processedCount: 0, lowConfidenceCount: 0 };
  }

  if (manual && toast) {
    toast.title = `Triaging ${entries.length} item(s)…`;
    toast.style = Toast.Style.Animated;
  }

  const { categories, recentTasks } = extractWorkCategories();
  const processed: InboxEntry[] = [];
  const lowConfidence: string[] = [];

  for (const entry of entries) {
    const prompt = buildTriagePrompt(entry, categories, recentTasks);

    try {
      const response = await AI.ask(prompt, { creativity: "none" });
      const result = parseTriageResponse(response);

      if (!result || result.confidence < 0.8) {
        lowConfidence.push(entry.title);
        continue;
      }

      routeTask(result);
      processed.push(entry);

      if (toast) {
        toast.message = `${processed.length}/${entries.length} done`;
      }
    } catch {
      lowConfidence.push(entry.title);
    }
  }

  removeProcessedEntries(processed);

  return {
    processedCount: processed.length,
    lowConfidenceCount: lowConfidence.length,
  };
}
