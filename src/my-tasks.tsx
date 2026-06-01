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
import { useState, useEffect, useCallback, useMemo } from "react";
import fs from "fs";
import { spawn } from "child_process";
import { loadAllTodos, parseScheduleFile, ParsedSchedule } from "./lib/parser";
import {
  completeAndArchive,
  deleteTask,
  cyclePriority,
  completeScheduleItem,
  deferToTomorrow,
  addToTodaySchedule,
  toggleHabit,
} from "./lib/writer";
import {
  WORK_TODO_PATH,
  PERSONAL_TODO_PATH,
  HABITS_PATH,
  todayScheduleFile,
} from "./lib/paths";
import { Todo, PRIORITY_LABELS } from "./lib/types";
import {
  computeSlipAge,
  findOverlooked,
  computeYesterdayStats,
  YesterdayStats,
} from "./lib/reflection";
import {
  Habit,
  HabitState,
  parseHabitsFile,
  isDueOn,
  getHabitState,
  sparkline,
  formatStreakBadge,
} from "./lib/habits";

const STORAGE_KEY_FILTER = "latch-project-filter";
const STORAGE_KEY_PINNED = "latch-pinned-projects";
const STORAGE_KEY_COLLAPSED = "latch-collapsed-projects";

const TODAY_FILTER = "__today__";

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
    lines.push(
      `**Source**: ${url ? `[${todo.sourceRef}](${url})` : todo.sourceRef}`,
    );
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
    if (aPinned && bPinned)
      return pinnedProjects.indexOf(a) - pinnedProjects.indexOf(b);
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

function slipBadgeColor(slipAge: number): Color {
  if (slipAge >= 6) return Color.Red;
  if (slipAge >= 3) return Color.Orange;
  return Color.SecondaryText;
}

function formatStatsTitle(s: YesterdayStats): string {
  const parts = [`Yesterday: ${s.done}/${s.total}`];
  if (s.deferredOut > 0) parts.push(`${s.deferredOut} deferred`);
  if (s.chronicMax >= 3) parts.push(`1 chronic (${s.chronicMax}d)`);
  return parts.join(" · ");
}

export default function Command() {
  const [showDetail, setShowDetail] = useState(false);
  const [showAlignment, setShowAlignment] = useState(false);
  const [projectFilter, setProjectFilter] = useState("all");
  const [pinnedProjects, setPinnedProjects] = useState<string[]>([]);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
    new Set(),
  );
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      LocalStorage.getItem<string>(STORAGE_KEY_FILTER),
      LocalStorage.getItem<string>(STORAGE_KEY_PINNED),
      LocalStorage.getItem<string>(STORAGE_KEY_COLLAPSED),
    ]).then(([savedFilter, savedPinned, savedCollapsed]) => {
      const todayExists = fs.existsSync(todayScheduleFile());
      if (todayExists) {
        setProjectFilter(TODAY_FILTER);
      } else if (savedFilter) {
        setProjectFilter(savedFilter);
      }
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

  const {
    isLoading,
    data: todos,
    revalidate,
  } = usePromise(
    async () => loadAllTodos(WORK_TODO_PATH, PERSONAL_TODO_PATH),
    [],
  );

  const {
    isLoading: scheduleLoading,
    data: schedule,
    revalidate: revalidateSchedule,
  } = usePromise(async () => {
    const today = new Date();
    const scheduleFile = todayScheduleFile();
    const exists = fs.existsSync(scheduleFile);
    const parsed: ParsedSchedule = exists
      ? parseScheduleFile(scheduleFile)
      : { tasks: [], alignment: "", sectionOrder: [] };
    const slipAges = new Map<string, number>();
    if (exists) {
      for (const t of parsed.tasks) {
        slipAges.set(
          `${t.sourceFile}:${t.lineNumber}`,
          computeSlipAge(t, today),
        );
      }
    }
    const stats = exists ? computeYesterdayStats(today) : null;
    const habits = parseHabitsFile(HABITS_PATH);
    const dueHabits = habits.filter((h) => isDueOn(h, today));
    const habitStates = new Map<string, HabitState>();
    for (const h of dueHabits) {
      habitStates.set(h.name, getHabitState(h, today));
    }
    const habitSpark = habits.length > 0 ? sparkline(habits, today) : "";
    const habitsDone = dueHabits.filter(
      (h) => habitStates.get(h.name)?.checked,
    ).length;
    return {
      exists,
      parsed,
      slipAges,
      stats,
      dueHabits,
      habitStates,
      habitSpark,
      habitsDone,
    };
  }, []);

  const overlookedItems = useMemo(() => {
    if (!todos) return [];
    return findOverlooked(todos, new Date());
  }, [todos]);

  function refreshAll() {
    revalidate();
    revalidateSchedule();
  }

  function runPrioSkill() {
    try {
      const child = spawn("amp", ["-x", "Use the prio skill"], {
        detached: true,
        stdio: "ignore",
      });
      child.on("exit", () => refreshAll());
      child.unref();
      showToast({
        style: Toast.Style.Animated,
        title: "Generating today's schedule…",
      });
    } catch (e) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to launch amp",
        message: String(e),
      });
    }
  }

  async function handleComplete(todo: Todo) {
    try {
      completeAndArchive(todo);
      await showToast({
        style: Toast.Style.Success,
        title: "Archived",
        message: todo.description,
      });
      revalidate();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed",
        message: String(e),
      });
    }
  }

  async function handleCompleteSchedule(todo: Todo) {
    try {
      completeScheduleItem(todo, [WORK_TODO_PATH, PERSONAL_TODO_PATH]);
      await showToast({
        style: Toast.Style.Success,
        title: "Completed",
        message: todo.description,
      });
      refreshAll();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed",
        message: String(e),
      });
    }
  }

  async function handleDefer(todo: Todo) {
    try {
      deferToTomorrow(todo);
      await showToast({
        style: Toast.Style.Success,
        title: "Deferred to tomorrow",
      });
      refreshAll();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed",
        message: String(e),
      });
    }
  }

  async function handleToggleHabit(habit: Habit) {
    try {
      toggleHabit(habit, new Date());
      await showToast({
        style: Toast.Style.Success,
        title: "Toggled",
        message: habit.name,
      });
      refreshAll();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed",
        message: String(e),
      });
    }
  }

  async function handleAddToToday(todo: Todo) {
    try {
      addToTodaySchedule(todo);
      await showToast({ style: Toast.Style.Success, title: "Added to today" });
      refreshAll();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed",
        message: String(e),
      });
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
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed",
        message: String(e),
      });
    }
  }

  async function handleCyclePriority(todo: Todo) {
    try {
      cyclePriority(todo);
      const next = PRIORITY_LABELS[((todo.priority + 1) % 4) as 0 | 1 | 2 | 3];
      await showToast({
        style: Toast.Style.Success,
        title: `Priority → ${next}`,
      });
      refreshAll();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed",
        message: String(e),
      });
    }
  }

  const activeTodos = (todos ?? [])
    .filter((t) => !t.done)
    .sort((a, b) => a.priority - b.priority);
  const grouped = groupByProject(activeTodos);
  const sorted = sortedProjectEntries(grouped, pinnedProjects);

  if (projectFilter === TODAY_FILTER) {
    return (
      <List
        isLoading={isLoading || scheduleLoading || !prefsLoaded}
        isShowingDetail={showDetail || showAlignment}
        searchBarAccessory={
          <List.Dropdown
            tooltip="Filter by project"
            value={projectFilter}
            onChange={handleFilterChange}
          >
            <List.Dropdown.Item
              title="Today"
              value={TODAY_FILTER}
              icon={Icon.Calendar}
            />
            <List.Dropdown.Item title="All Projects" value="all" />
            <List.Dropdown.Section title="Projects">
              {sorted.map(([name, tasks]) => (
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
        {renderTodayLens()}
      </List>
    );
  }

  const filtered =
    projectFilter === "all"
      ? sorted
      : sorted.filter(([p]) => p === projectFilter);

  return (
    <List
      isLoading={isLoading || !prefsLoaded}
      isShowingDetail={showDetail}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by project"
          value={projectFilter}
          onChange={handleFilterChange}
        >
          <List.Dropdown.Item
            title="Today"
            value={TODAY_FILTER}
            icon={Icon.Calendar}
          />
          <List.Dropdown.Item title="All Projects" value="all" />
          <List.Dropdown.Section title="Projects">
            {sortedProjectEntries(grouped, pinnedProjects).map(
              ([name, tasks]) => (
                <List.Dropdown.Item
                  key={name}
                  title={`${pinnedProjects.includes(name) ? "📌 " : ""}${name} (${tasks.length})`}
                  value={name}
                />
              ),
            )}
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
            <List.Section
              key={project}
              title={sectionTitle}
              subtitle={`${tasks.length} — collapsed`}
            >
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
          <List.Section
            key={project}
            title={sectionTitle}
            subtitle={`${tasks.length}`}
          >
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
                        ...(todo.sourceRef
                          ? [{ tag: todo.sourceRef, icon: Icon.Link }]
                          : []),
                        {
                          tag: {
                            value: PRIORITY_LABELS[todo.priority],
                            color: PRIORITY_RAYCAST_COLORS[todo.priority],
                          },
                        },
                      ]
                }
                detail={
                  showDetail ? (
                    <List.Item.Detail markdown={buildDetailMarkdown(todo)} />
                  ) : undefined
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
                          title={
                            isPinned ? "Unpin Section" : "Pin Section to Top"
                          }
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

  function renderHabitsSection() {
    if (!schedule) return null;
    const { dueHabits, habitStates, habitSpark, habitsDone } = schedule;
    if (dueHabits.length === 0) return null;
    const subtitle = `${habitSpark}  ${habitsDone}/${dueHabits.length} today`;
    return (
      <List.Section title="Habits" subtitle={subtitle}>
        {dueHabits.map((habit) => {
          const state = habitStates.get(habit.name) ?? {
            checked: false,
            paused: false,
            streak: 0,
          };
          const badge = formatStreakBadge(state);
          const accessories: List.Item.Accessory[] = [];
          if (badge) {
            accessories.push({
              text: state.paused
                ? { value: badge, color: Color.Orange }
                : badge,
            });
          }
          return (
            <List.Item
              key={`habit-${habit.name}`}
              icon={{
                source: state.checked ? Icon.Checkmark : Icon.Circle,
                tintColor: state.checked
                  ? Color.Green
                  : state.paused
                    ? Color.Orange
                    : Color.SecondaryText,
              }}
              title={
                state.paused
                  ? { value: habit.name, tooltip: "Yesterday missed — pause" }
                  : habit.name
              }
              accessories={accessories}
              actions={
                <ActionPanel>
                  <Action
                    icon={state.checked ? Icon.XMarkCircle : Icon.Checkmark}
                    title={state.checked ? "Mark Missed" : "Mark Done"}
                    onAction={() => handleToggleHabit(habit)}
                  />
                  <Action
                    icon={Icon.ArrowClockwise}
                    title="Refresh"
                    onAction={refreshAll}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    );
  }

  function renderTodayLens() {
    if (!schedule) return null;
    if (!schedule.exists) {
      return (
        <>
          <List.Section title="Today">
            <List.Item
              icon={Icon.Calendar}
              title="No schedule for today"
              accessories={[{ text: "Generate via prio" }]}
              actions={
                <ActionPanel>
                  <Action
                    icon={Icon.Wand}
                    title="Generate via Prio"
                    onAction={runPrioSkill}
                  />
                  <Action
                    icon={Icon.ArrowClockwise}
                    title="Refresh"
                    onAction={refreshAll}
                  />
                </ActionPanel>
              }
            />
          </List.Section>
          {renderHabitsSection()}
        </>
      );
    }

    const { parsed, slipAges, stats } = schedule;
    const sectionMap = new Map<string, Todo[]>();
    for (const section of parsed.sectionOrder) sectionMap.set(section, []);
    for (const t of parsed.tasks) {
      if (t.done) continue;
      const key = t.project ?? "Uncategorized";
      if (!sectionMap.has(key)) {
        sectionMap.set(key, []);
        parsed.sectionOrder.push(key);
      }
      sectionMap.get(key)!.push(t);
    }

    return (
      <>
        {stats && (
          <List.Section title={formatStatsTitle(stats)}>
            <List.Item
              icon={Icon.BarChart}
              title="Yesterday's wrap-up"
              accessories={[{ text: `${stats.done}/${stats.total} done` }]}
              actions={
                <ActionPanel>
                  <Action
                    icon={Icon.ArrowClockwise}
                    title="Refresh"
                    onAction={refreshAll}
                  />
                </ActionPanel>
              }
            />
          </List.Section>
        )}
        {parsed.sectionOrder.map((section) => {
          const items = sectionMap.get(section) ?? [];
          if (items.length === 0) return null;
          return (
            <List.Section
              key={section}
              title={section}
              subtitle={`${items.length}`}
            >
              {items.map((todo) => renderScheduleItem(todo, slipAges))}
            </List.Section>
          );
        })}
        {overlookedItems.length > 0 && (
          <List.Section
            title="⚠ Overlooked"
            subtitle={`${overlookedItems.length}`}
          >
            {overlookedItems.map((todo) => (
              <List.Item
                key={`overlooked-${todo.sourceFile}:${todo.lineNumber}`}
                icon={{ source: Icon.ExclamationMark, tintColor: Color.Yellow }}
                title={todo.description}
                accessories={[
                  ...(todo.sourceRef
                    ? [{ tag: todo.sourceRef, icon: Icon.Link }]
                    : []),
                  {
                    tag: {
                      value: PRIORITY_LABELS[todo.priority],
                      color: PRIORITY_RAYCAST_COLORS[todo.priority],
                    },
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      icon={Icon.PlusCircle}
                      title="Add to Today's Schedule"
                      onAction={() => handleAddToToday(todo)}
                    />
                    {todo.sourceRef && sourceRefToUrl(todo.sourceRef) && (
                      <Action.OpenInBrowser
                        title="Open Source Ref"
                        url={sourceRefToUrl(todo.sourceRef)!}
                      />
                    )}
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        )}
        {renderHabitsSection()}
      </>
    );
  }

  function renderScheduleItem(todo: Todo, slipAges: Map<string, number>) {
    const key = `${todo.sourceFile}:${todo.lineNumber}`;
    const slipAge = slipAges.get(key) ?? 0;
    const accessories: List.Item.Accessory[] = [];
    if (slipAge > 0) {
      accessories.push({
        text: { value: `↻ ${slipAge}d`, color: slipBadgeColor(slipAge) },
      });
    }
    if (todo.sourceRef)
      accessories.push({ tag: todo.sourceRef, icon: Icon.Link });
    accessories.push({
      tag: {
        value: PRIORITY_LABELS[todo.priority],
        color: PRIORITY_RAYCAST_COLORS[todo.priority],
      },
    });

    const alignmentMarkdown =
      showAlignment && schedule?.parsed.alignment
        ? `# Alignment\n\n${schedule.parsed.alignment}`
        : buildDetailMarkdown(todo);

    return (
      <List.Item
        key={key}
        icon={{
          source: todo.done ? Icon.Checkmark : Icon.Circle,
          tintColor: PRIORITY_RAYCAST_COLORS[todo.priority],
        }}
        title={todo.description}
        accessories={showDetail || showAlignment ? [] : accessories}
        detail={
          showDetail || showAlignment ? (
            <List.Item.Detail markdown={alignmentMarkdown} />
          ) : undefined
        }
        actions={
          <ActionPanel>
            <ActionPanel.Section>
              <Action
                icon={Icon.Checkmark}
                title="Complete"
                onAction={() => handleCompleteSchedule(todo)}
              />
              <Action
                icon={Icon.Calendar}
                title="Defer to Tomorrow (Copy)"
                onAction={() => handleDefer(todo)}
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
                icon={Icon.AppWindowSidebarRight}
                title="Toggle Detail"
                onAction={() => setShowDetail((s) => !s)}
              />
              {schedule?.parsed.alignment && (
                <Action
                  icon={Icon.Book}
                  title="Toggle Alignment Detail"
                  onAction={() => setShowAlignment((s) => !s)}
                />
              )}
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  }
}
