import fs from "fs";
import { execFile } from "child_process";
import { INBOX_PATH, WORK_TODO_PATH, PERSONAL_TODO_PATH } from "./paths";

const GH_PATH = "/opt/homebrew/bin/gh";
const WORKSPACE_REPO = "0x00101010/workspace";

const ASSIGNED_REPOS = ["base/base", "base/node", "base/docs"];

const REPO_TO_PROJECT: Record<string, string> = {
  "base/base": "Review",
};

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  createdAt: string;
  repository?: { nameWithOwner: string };
}

export interface SyncResult {
  added: number;
  skipped: number;
  workspaceIssues: WorkspaceIssue[];
}

export interface WorkspaceIssue {
  number: number;
  title: string;
}

function ghExec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(GH_PATH, args, { timeout: 30000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function fetchWorkspaceIssues(): Promise<GitHubIssue[]> {
  try {
    const out = await ghExec([
      "issue",
      "list",
      "--repo",
      WORKSPACE_REPO,
      "--json",
      "number,title,body,createdAt",
      "--limit",
      "50",
    ]);
    return out.trim() ? JSON.parse(out) : [];
  } catch {
    return [];
  }
}

async function fetchAssignedIssues(): Promise<GitHubIssue[]> {
  const all: GitHubIssue[] = [];
  for (const repo of ASSIGNED_REPOS) {
    try {
      const out = await ghExec([
        "issue",
        "list",
        "--repo",
        repo,
        "--assignee",
        "@me",
        "--json",
        "number,title,body,createdAt",
        "--limit",
        "50",
      ]);
      if (!out.trim()) continue;
      const issues: GitHubIssue[] = JSON.parse(out);
      for (const issue of issues) {
        issue.repository = { nameWithOwner: repo };
      }
      all.push(...issues);
    } catch { }
  }
  return all;
}

function collectExistingRefs(): Set<string> {
  const refs = new Set<string>();
  const refRe = /(?:LINEAR:\S+|GH:\S+)/g;
  const inboxIssueRe = /\[GH-WORKSPACE#(\d+)\]/;

  for (const filePath of [INBOX_PATH, WORK_TODO_PATH, PERSONAL_TODO_PATH]) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const matches = line.match(refRe);
      if (matches) {
        for (const m of matches) refs.add(m);
      }
      const wsMatch = line.match(inboxIssueRe);
      if (wsMatch) refs.add(`GH-WORKSPACE#${wsMatch[1]}`);
    }
  }

  return refs;
}

function formatTimestamp(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  return `${date} ${time}`;
}

function appendToInbox(entries: string[]): void {
  if (entries.length === 0) return;

  const block = entries.join("");

  if (!fs.existsSync(INBOX_PATH)) {
    fs.writeFileSync(INBOX_PATH, `# Inbox\n\n${block}`, "utf-8");
  } else {
    fs.appendFileSync(INBOX_PATH, block, "utf-8");
  }
}

export async function syncSources(): Promise<SyncResult> {
  const [workspaceIssues, assignedIssues] = await Promise.all([
    fetchWorkspaceIssues(),
    fetchAssignedIssues(),
  ]);

  const existingRefs = collectExistingRefs();
  const entries: string[] = [];
  const trackedWorkspaceIssues: WorkspaceIssue[] = [];
  let skipped = 0;
  const ts = formatTimestamp();

  for (const issue of workspaceIssues) {
    const marker = `GH-WORKSPACE#${issue.number}`;
    if (existingRefs.has(marker)) {
      skipped++;
      continue;
    }

    let entry = `- ${ts} | ${issue.title} [GH-WORKSPACE#${issue.number}]\n`;
    if (issue.body?.trim()) {
      for (const line of issue.body.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) entry += `  > ${trimmed}\n`;
      }
    }

    entries.push(entry);
    trackedWorkspaceIssues.push({ number: issue.number, title: issue.title });
  }

  for (const issue of assignedIssues) {
    const repo = issue.repository!.nameWithOwner;
    const sourceRef = `GH:${repo}#${issue.number}`;

    if (existingRefs.has(sourceRef)) {
      skipped++;
      continue;
    }

    const project = REPO_TO_PROJECT[repo];
    let entry = `- ${ts} | ${issue.title}\n`;
    entry += `  > ${sourceRef}\n`;
    if (project) entry += `  > project: ${project}\n`;
    if (issue.body?.trim()) {
      const firstLine = issue.body
        .split("\n")
        .find((l) => l.trim())
        ?.trim();
      if (firstLine) entry += `  > ${firstLine.slice(0, 200)}\n`;
    }

    entries.push(entry);
  }

  appendToInbox(entries);

  return {
    added: entries.length,
    skipped,
    workspaceIssues: trackedWorkspaceIssues,
  };
}

export async function closeWorkspaceIssues(
  issues: WorkspaceIssue[],
): Promise<void> {
  await Promise.all(
    issues.map((issue) =>
      ghExec([
        "issue",
        "close",
        String(issue.number),
        "--repo",
        WORKSPACE_REPO,
        "--comment",
        "Auto-triaged by Latch",
      ]).catch(() => { }),
    ),
  );
}
