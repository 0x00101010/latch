import { AI, showHUD, showToast, Toast, environment } from "@raycast/api";
import {
  parseInbox,
  extractWorkCategories,
  buildTriagePrompt,
  parseTriageResponse,
  routeTask,
  removeProcessedEntries,
  InboxEntry,
} from "./lib/triage";

export default async function Command() {
  const manual = environment.launchType === "userInitiated";
  const entries = parseInbox();

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
  const processed: InboxEntry[] = [];
  const lowConfidence: string[] = [];

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
        processed.push(entry);
        if (toast) {
          toast.message = `${processed.length}/${entries.length} done`;
        }
      } else {
        lowConfidence.push(entry.title);
      }
    } catch {
      lowConfidence.push(entry.title);
    }
  }

  removeProcessedEntries(processed);

  const summary =
    lowConfidence.length > 0
      ? `Triaged ${processed.length}, ${lowConfidence.length} need manual triage`
      : `Triaged ${processed.length} item(s)`;

  if (toast) {
    toast.style = lowConfidence.length > 0 ? Toast.Style.Failure : Toast.Style.Success;
    toast.title = summary;
    toast.message = undefined;
  } else if (lowConfidence.length > 0) {
    await showHUD(`Latch: ${lowConfidence.length} item(s) need manual triage`);
  }
}
