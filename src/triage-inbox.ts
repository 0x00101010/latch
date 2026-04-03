import { AI, showHUD, environment } from "@raycast/api";
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
  const entries = parseInbox();
  if (entries.length === 0) {
    if (environment.launchType === "userInitiated") {
      await showHUD("Inbox empty — nothing to triage");
    }
    return;
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
      } else {
        lowConfidence.push(entry.title);
      }
    } catch {
      lowConfidence.push(entry.title);
    }
  }

  removeProcessedEntries(processed);

  if (lowConfidence.length > 0) {
    await showHUD(`Latch: ${lowConfidence.length} item(s) need manual triage`);
  } else if (processed.length > 0) {
    await showHUD(`Latch: triaged ${processed.length} item(s)`);
  }
}
