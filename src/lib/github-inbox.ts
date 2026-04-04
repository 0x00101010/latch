import { execFile } from "child_process";
import { InboxEntry } from "./triage";

const REPO = "0x00101010/workspace";
const GH_PATH = "/opt/homebrew/bin/gh";

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  createdAt: string;
}

export function fetchGitHubInbox(): Promise<InboxEntry[]> {
  return new Promise((resolve) => {
    execFile(
      GH_PATH,
      [
        "issue",
        "list",
        "--repo",
        REPO,
        "--label",
        "inbox",
        "--json",
        "number,title,body,createdAt",
        "--limit",
        "50",
      ],
      { timeout: 15000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve([]);
          return;
        }
        try {
          const issues: GitHubIssue[] = JSON.parse(stdout);
          resolve(
            issues.map((issue) => {
              const context: string[] = [];
              if (issue.body?.trim()) {
                for (const line of issue.body.split("\n")) {
                  const trimmed = line.trim();
                  if (trimmed) context.push(trimmed);
                }
              }
              return {
                title: issue.title,
                context,
                source: "github" as const,
                startLine: -1,
                endLine: -1,
                issueNumber: issue.number,
              };
            }),
          );
        } catch {
          resolve([]);
        }
      },
    );
  });
}

export function closeGitHubIssue(issueNumber: number, category: string, priority: string): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      GH_PATH,
      [
        "issue",
        "close",
        String(issueNumber),
        "--repo",
        REPO,
        "--comment",
        `Auto-triaged by Latch → ${category} (${priority})`,
      ],
      { timeout: 15000 },
      () => resolve(),
    );
  });
}
