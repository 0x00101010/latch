import { Action, ActionPanel, Form, popToRoot, showToast, Toast } from "@raycast/api";
import fs from "fs";
import { INBOX_PATH } from "./lib/paths";

interface FormValues {
  task: string;
}

export default function Command() {
  async function handleSubmit(values: FormValues) {
    const text = values.task.trim();
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

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add to Inbox" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="task" title="Task" placeholder="What needs to be done?" autoFocus />
    </Form>
  );
}
