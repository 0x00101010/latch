import { showHUD, showToast, Toast, environment } from "@raycast/api";
import { triageInbox } from "./lib/triage";

export default async function Command() {
  const manual = environment.launchType === "userInitiated";

  let toast: Toast | undefined;
  if (manual) {
    toast = await showToast({
      style: Toast.Style.Animated,
      title: "Triaging inbox…",
    });
  }

  const result = await triageInbox(manual, toast);

  if (result.processedCount === 0 && result.lowConfidenceCount === 0) {
    if (manual) await showHUD("Inbox empty — nothing to triage");
    return;
  }

  const summary =
    result.lowConfidenceCount > 0
      ? `Triaged ${result.processedCount}, ${result.lowConfidenceCount} need manual triage`
      : `Triaged ${result.processedCount} item(s)`;

  if (toast) {
    toast.style =
      result.lowConfidenceCount > 0 ? Toast.Style.Failure : Toast.Style.Success;
    toast.title = summary;
    toast.message = undefined;
  } else if (result.lowConfidenceCount > 0) {
    await showHUD(
      `Latch: ${result.lowConfidenceCount} item(s) need manual triage`,
    );
  }
}
