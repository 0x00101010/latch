import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  LocalStorage,
  confirmAlert,
  Alert,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState, useEffect, useCallback } from "react";
import { loadAllTodos } from "./lib/parser";
import { completeAndArchive, deleteTask, cyclePriority } from "./lib/writer";
import { WORK_TODO_PATH, PERSONAL_TODO_PATH } from "./lib/paths";
import { Todo, PRIORITY_LABELS } from "./lib/types";

const STORAGE_KEY_FILTER = "latch-project-filter";
const STORAGE_KEY_PINNED = "latch-pinned-projects";
const STORAGE_KEY_COLLAPSED = "latch-collapsed-projects";

const PRIORITY_RAYCAST_COLORS: Record<number, Color> = {
  0: Color.Red,
  1: Color.Orange,
  2: Color.Blue,
  3: Color.SecondaryText,
};

function sourceRefToUrl(ref: string): string | undefined {
  if (ref.startsWith("LINEAR:")) {
    return `https://linear.app/issue/${ref.slice("LINEAR:".length)}`;
  }
  if (ref.startsWith("GH:")) {
    const target = ref.slice("GH:".length);
    if (target.includes("#")) {
      const [repo, num] = target.split("#");
      return `https://github.com/${repo}/pull/${num}`;
    }
    if (target.startsWith("doc/")) {
      return `https://docs.google.com/document/d/${target.slice("doc/".length)}`;
    }
    return `https://github.com/${target}`;
  }
  return undefined;
}

function buildDetailMarkdown(todo: Todo): string {
  const lines: string[] = [`## ${todo.description}`, ""];
  lines.push(`**Priority**: ${PRIORITY_LABELS[todo.priority]}`);
  if (todo.project) lines.push(`**Project**: ${todo.project}`);
  if (todo.sourceRef) {
    const url = sourceRefToUrl(todo.sourceRef);
    lines.push(`**Source**: ${url ? `[${todo.sourceRef}](${url})` : todo.sourceRef}`);
  }
  if (todo.context.length > 0) {
    lines.push("", "---", "");
    for (const ctx of todo.context) {
      lines.push(`> ${ctx}`);
    }
  }
  return lines.join("\n");
}

function groupByProject(todos: Todo[]): Map<string, Todo[]> {
  const groups = new Map<string, Todo[]>();
  for (const todo of todos) {
    const key = todo.project ?? "Uncategorized";
    const group = groups.get(key) ?? [];
    group.push(todo);
    groups.set(key, group);
  }
  return groups;
}

function sortedProjectEntries(
  grouped: Map<string, Todo[]>,
  pinnedProjects: string[],
): [string, Todo[]][] {
  const entries = Array.from(grouped.entries());
  return entries.sort(([a], [b]) => {
    const aPinned = pinnedProjects.includes(a);
    const bPinned = pinnedProjects.includes(b);
    if (aPinned && bPinned) return pinnedProjects.indexOf(a) - pinnedProjects.indexOf(b);
    if (aPinned) return -1;
    if (bPinned) return 1;
    return a.localeCompare(b);
  });
}

function parseStoredSet(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export default function Command() {
  const [showDetail, setShowDetail] = useState(false);
  const [projectFilter, setProjectFilter] = useState("all");
  const [pinnedProjects, setPinnedProjects] = useState<string[]>([]);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      LocalStorage.getItem<string>(STORAGE_KEY_FILTER),
      LocalStorage.getItem<string>(STORAGE_KEY_PINNED),
      LocalStorage.getItem<string>(STORAGE_KEY_COLLAPSED),
    ]).then(([savedFilter, savedPinned, savedCollapsed]) => {
      if (savedFilter) setProjectFilter(savedFilter);
      if (savedPinned) {
        try {
          setPinnedProjects(JSON.parse(savedPinned));
        } catch {
          /* use default */
        }
      }
      setCollapsedProjects(parseStoredSet(savedCollapsed));
      setPrefsLoaded(true);
    });
  }, []);

  const handleFilterChange = useCallback((value: string) => {
    setProjectFilter(value);
    LocalStorage.setItem(STORAGE_KEY_FILTER, value);
  }, []);

  const togglePin = useCallback((project: string) => {
    setPinnedProjects((prev) => {
      const next = prev.includes(project)
        ? prev.filter((p) => p !== project)
        : [...prev, project];
      LocalStorage.setItem(STORAGE_KEY_PINNED, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((project: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      LocalStorage.setItem(STORAGE_KEY_COLLAPSED, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const { isLoading, data: todos, revalidate } = usePromise(
    async () => loadAllTodos(WORK_TODO_PATH, PERSONAL_TODO_PATH),
    [],
  );

  async function handleComplete(todo: Todo) {
    try {
      completeAndArchive(todo);
      await showToast({ style: Toast.Style.Success, title: "Archived", message: todo.description });
      revalidate();
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed", message: String(e) });
    }
  }

  async function handleDelete(todo: Todo) {
    const confirmed = await confirmAlert({
      title: `Delete "${todo.description}"?`,
      message: "This will permanently remove the task without archiving.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    try {
      deleteTask(todo);
      await showToast({ style: Toast.Style.Success, title: "Deleted" });
      revalidate();
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed", message: String(e) });
    }
  }

  async function handleCyclePriority(todo: Todo) {
    try {
      cyclePriority(todo);
      const next = PRIORITY_LABELS[((todo.priority + 1) % 4) as 0 | 1 | 2 | 3];
      await showToast({ style: Toast.Style.Success, title: `Priority → ${next}` });
      revalidate();
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed", message: String(e) });
    }
  }

  const activeTodos = (todos ?? [])
    .filter((t) => !t.done)
    .sort((a, b) => a.priority - b.priority);
  const grouped = groupByProject(activeTodos);
  const sorted = sortedProjectEntries(grouped, pinnedProjects);
  const filtered =
    projectFilter === "all" ? sorted : sorted.filter(([p]) => p === projectFilter);

  return (
    <List
      isLoading={isLoading || !prefsLoaded}
      isShowingDetail={showDetail}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by project" value={projectFilter} onChange={handleFilterChange}>
          <List.Dropdown.Item title="All Projects" value="all" />
          <List.Dropdown.Section title="Projects">
            {sortedProjectEntries(grouped, pinnedProjects).map(([name, tasks]) => (
              <List.Dropdown.Item
                key={name}
                title={`${pinnedProjects.includes(name) ? "📌 " : ""}${name} (${tasks.length})`}
                value={name}
              />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {filtered.map(([project, tasks]) => {
        const isPinned = pinnedProjects.includes(project);
        const isCollapsed = collapsedProjects.has(project);
        const sectionTitle = `${isPinned ? "📌 " : ""}${project}`;

        if (isCollapsed) {
          return (
            <List.Section key={project} title={sectionTitle} subtitle={`${tasks.length} — collapsed`}>
              <List.Item
                key={`collapsed-${project}`}
                icon={Icon.ChevronRight}
                title={`${tasks.length} tasks hidden`}
                accessories={[{ text: "Expand to show" }]}
                actions={
                  <ActionPanel>
                    <Action
                      icon={Icon.Eye}
                      title="Expand Section"
                      onAction={() => toggleCollapse(project)}
                    />
                    <Action
                      icon={isPinned ? Icon.PinDisabled : Icon.Pin}
                      title={isPinned ? "Unpin Section" : "Pin Section to Top"}
                      onAction={() => togglePin(project)}
                    />
                  </ActionPanel>
                }
              />
            </List.Section>
          );
        }

        return (
          <List.Section key={project} title={sectionTitle} subtitle={`${tasks.length}`}>
            {tasks.map((todo) => (
              <List.Item
                key={`${todo.sourceFile}:${todo.lineNumber}`}
                icon={{
                  source: todo.done ? Icon.Checkmark : Icon.Circle,
                  tintColor: PRIORITY_RAYCAST_COLORS[todo.priority],
                }}
                title={todo.description}
                accessories={
                  showDetail
                    ? []
                    : [
                        ...(todo.sourceRef ? [{ tag: todo.sourceRef, icon: Icon.Link }] : []),
                        {
                          tag: {
                            value: PRIORITY_LABELS[todo.priority],
                            color: PRIORITY_RAYCAST_COLORS[todo.priority],
                          },
                        },
                      ]
                }
                detail={
                  showDetail ? <List.Item.Detail markdown={buildDetailMarkdown(todo)} /> : undefined
                }
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action
                        icon={Icon.Checkmark}
                        title="Complete & Archive"
                        onAction={() => handleComplete(todo)}
                      />
                      <Action
                        icon={Icon.AppWindowSidebarRight}
                        title="Toggle Detail"
                        onAction={() => setShowDetail((s) => !s)}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        icon={Icon.ArrowClockwise}
                        title="Cycle Priority"
                        onAction={() => handleCyclePriority(todo)}
                      />
                      {todo.sourceRef && sourceRefToUrl(todo.sourceRef) && (
                        <Action.OpenInBrowser
                          title="Open Source Ref"
                          url={sourceRefToUrl(todo.sourceRef)!}
                        />
                      )}
                      <Action
                        icon={Icon.Trash}
                        title="Delete (No Archive)"
                        style={Action.Style.Destructive}
                        onAction={() => handleDelete(todo)}
                      />
                    </ActionPanel.Section>
                    {todo.project && (
                      <ActionPanel.Section title="Section">
                        <Action
                          icon={isPinned ? Icon.PinDisabled : Icon.Pin}
                          title={isPinned ? "Unpin Section" : "Pin Section to Top"}
                          onAction={() => togglePin(todo.project!)}
                        />
                        <Action
                          icon={Icon.EyeDisabled}
                          title="Collapse Section"
                          onAction={() => toggleCollapse(todo.project!)}
                        />
                      </ActionPanel.Section>
                    )}
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}
