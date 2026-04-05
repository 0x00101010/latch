import { showHUD, showToast, Toast, environment } from "@raycast/api";
import { syncSources, closeWorkspaceIssues, WorkspaceIssue } from "./lib/sync";
import { triageInbox } from "./lib/triage";

export default async function Command() {
  const manual = environment.launchType === "userInitiated";

  let toast: Toast | undefined;
  if (manual) {
    toast = await showToast({
      style: Toast.Style.Animated,
      title: "Syncing sources…",
    });
  }

  let syncedWorkspaceIssues: WorkspaceIssue[] = [];
  try {
    const syncResult = await syncSources();
    syncedWorkspaceIssues = syncResult.workspaceIssues;

    if (manual && toast) {
      toast.title =
        syncResult.added > 0
          ? `Synced ${syncResult.added} item(s), triaging…`
          : "No new items, triaging inbox…";
    }
  } catch (e) {
    if (manual)
      await showHUD(
        `Sync failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    return;
  }

  const triageResult = await triageInbox(manual, toast);

  if (triageResult.processedCount > 0 && syncedWorkspaceIssues.length > 0) {
    await closeWorkspaceIssues(syncedWorkspaceIssues);
  }

  const parts: string[] = [];
  if (triageResult.processedCount > 0)
    parts.push(`triaged ${triageResult.processedCount}`);
  if (triageResult.lowConfidenceCount > 0)
    parts.push(`${triageResult.lowConfidenceCount} need manual triage`);
  if (parts.length === 0) parts.push("inbox empty");

  const summary = parts.join(", ");

  if (toast) {
    toast.style =
      triageResult.lowConfidenceCount > 0
        ? Toast.Style.Failure
        : Toast.Style.Success;
    toast.title = summary.charAt(0).toUpperCase() + summary.slice(1);
    toast.message = undefined;
  } else if (triageResult.lowConfidenceCount > 0) {
    await showHUD(
      `Latch: ${triageResult.lowConfidenceCount} item(s) need manual triage`,
    );
  }
}
