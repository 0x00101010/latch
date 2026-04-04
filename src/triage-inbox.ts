import { AI, showHUD, showToast, Toast, environment } from "@raycast/api";
import {
  parseInbox,
  extractWorkCategories,
  buildTriagePrompt,
  parseTriageResponse,
  routeTask,
  removeProcessedEntries,
  InboxEntry,
  TriageResult,
} from "./lib/triage";
import { fetchGitHubInbox, closeGitHubIssue } from "./lib/github-inbox";

export default async function Command() {
  const manual = environment.launchType === "userInitiated";

  const [localEntries, githubEntries] = await Promise.all([Promise.resolve(parseInbox()), fetchGitHubInbox()]);

  const entries = [...localEntries, ...githubEntries];

  if (entries.length === 0) {
    if (manual) await showHUD("Inbox empty — nothing to triage");
    return;
  }

  let toast: Toast | undefined;
  if (manual) {
    toast = await showToast({
      style: Toast.Style.Animated,
      title: `Triaging ${entries.length} item(s)…`,
    });
  }

  const { categories, recentTasks } = extractWorkCategories();
  const processedLocal: InboxEntry[] = [];
  const processedGitHub: { entry: InboxEntry; result: TriageResult }[] = [];
  const lowConfidence: string[] = [];
  let doneCount = 0;

  for (const entry of entries) {
    const prompt = buildTriagePrompt(entry, categories, recentTasks);

    try {
      const response = await AI.ask(prompt, { creativity: "none" });
      const result = parseTriageResponse(response);

      if (!result) {
        lowConfidence.push(entry.title);
        continue;
      }

      if (result.confidence >= 0.8) {
        routeTask(result);
        if (entry.source === "github") {
          processedGitHub.push({ entry, result });
        } else {
          processedLocal.push(entry);
        }
        doneCount++;
        if (toast) {
          toast.message = `${doneCount}/${entries.length} done`;
        }
      } else {
        lowConfidence.push(entry.title);
      }
    } catch {
      lowConfidence.push(entry.title);
    }
  }

  removeProcessedEntries(processedLocal);

  await Promise.all(
    processedGitHub
      .filter((p) => p.entry.issueNumber != null)
      .map((p) => closeGitHubIssue(p.entry.issueNumber!, p.result.category, p.result.priority)),
  );

  const totalProcessed = processedLocal.length + processedGitHub.length;
  const summary =
    lowConfidence.length > 0
      ? `Triaged ${totalProcessed}, ${lowConfidence.length} need manual triage`
      : `Triaged ${totalProcessed} item(s)`;

  if (toast) {
    toast.style = lowConfidence.length > 0 ? Toast.Style.Failure : Toast.Style.Success;
    toast.title = summary;
    toast.message = undefined;
  } else if (lowConfidence.length > 0) {
    await showHUD(`Latch: ${lowConfidence.length} item(s) need manual triage`);
  }
}
