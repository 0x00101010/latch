import { LaunchProps, popToRoot, showToast, Toast } from "@raycast/api";
import fs from "fs";
import { INBOX_PATH } from "./lib/paths";

interface Arguments {
  task: string;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const text = props.arguments.task.trim();
  if (!text) {
    await showToast({ style: Toast.Style.Failure, title: "Task cannot be empty" });
    return;
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  const line = `- ${date} ${time} | ${text}\n`;

  try {
    if (!fs.existsSync(INBOX_PATH)) {
      fs.writeFileSync(INBOX_PATH, `# Inbox\n\n${line}`, "utf-8");
    } else {
      fs.appendFileSync(INBOX_PATH, line, "utf-8");
    }

    await showToast({ style: Toast.Style.Success, title: "Added to inbox" });
    await popToRoot();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to add task",
      message: String(error),
    });
  }
}
