import { Action, ActionPanel, Form, LaunchProps, popToRoot, showToast, Toast } from "@raycast/api";
import { useRef } from "react";
import fs from "fs";
import { INBOX_PATH } from "./lib/paths";

interface Arguments {
  task: string;
}

function addToInbox(text: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  const line = `- ${date} ${time} | ${text}\n`;

  if (!fs.existsSync(INBOX_PATH)) {
    fs.writeFileSync(INBOX_PATH, `# Inbox\n\n${line}`, "utf-8");
  } else {
    fs.appendFileSync(INBOX_PATH, line, "utf-8");
  }
}

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const inlineText = props.arguments.task?.trim();
  const didRun = useRef(false);

  if (inlineText && !didRun.current) {
    didRun.current = true;

    try {
      addToInbox(inlineText);
      showToast({ style: Toast.Style.Success, title: "Added to inbox" }).then(() => popToRoot());
    } catch (error) {
      showToast({ style: Toast.Style.Failure, title: "Failed to add task", message: String(error) });
    }

    return null;
  }

  if (inlineText) {
    return null;
  }

  return <InboxForm />;
}

function InboxForm() {
  async function handleSubmit(values: { task: string }) {
    const text = values.task.trim();
    if (!text) {
      await showToast({ style: Toast.Style.Failure, title: "Task cannot be empty" });
      return;
    }

    try {
      addToInbox(text);
      await showToast({ style: Toast.Style.Success, title: "Added to inbox" });
      await popToRoot();
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to add task", message: String(error) });
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
      <Form.TextArea id="task" title="Task" placeholder="What needs to be done?" autoFocus />
    </Form>
  );
}
