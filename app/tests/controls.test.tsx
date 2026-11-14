import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

function TaskIcon(_properties: { size?: number }): null {
  return null;
}

const Clock3 = TaskIcon;
const Pause = TaskIcon;
const Play = TaskIcon;
const Square = TaskIcon;

type Action = "run" | "pause" | "cancel";

interface Settings {
  name: string;
  paused: boolean;
  researchAllowed: boolean;
  memoryAllowed: boolean;
}

interface Task {
  id: string;
  prompt: string;
  status: string;
  intervalSeconds: number | null;
  nextRunAt: number;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  lease: unknown;
  leaseUntil: number | null;
}

function TaskActions({
  task,
  busy,
  settings,
  onAction,
  onSchedule,
}: {
  task: Task;
  busy: boolean;
  settings: Settings;
  onAction: (action: Action) => void;
  onSchedule: () => void;
}) {
  const active = task.status === "running" || task.status === "queued";
  return (
    <div className="task-controls">
      {active ? (
        <button type="button" disabled={busy} onClick={() => onAction("pause")}>
          <Pause size={14} />
          Pause task
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || settings.paused || !settings.researchAllowed}
          onClick={() => onAction("run")}
        >
          <Play size={14} />
          {task.status === "interrupted"
            ? "Retry after review"
            : task.status === "failed"
              ? "Retry task"
              : task.status === "paused"
                ? "Resume task"
                : "Run again"}
        </button>
      )}
      {task.status === "completed" && !!task.intervalSeconds && (
        <button type="button" disabled={busy} onClick={() => onAction("pause")}>
          <Pause size={14} />
          Pause schedule
        </button>
      )}
      <button type="button" onClick={onSchedule}>
        <Clock3 size={14} />
        {task.intervalSeconds ? "Edit schedule" : "Set a schedule"}
      </button>
      {task.status !== "cancelled" && (
        <button
          type="button"
          disabled={busy}
          className="quiet-button"
          onClick={() => onAction("cancel")}
        >
          <Square size={12} />
          Cancel
        </button>
      )}
    </div>
  );
}

const settings: Settings = {
  name: "Dot",
  paused: false,
  researchAllowed: true,
  memoryAllowed: true,
};

const task: Task = {
  id: "one",
  prompt: "A recurring task",
  status: "completed",
  intervalSeconds: 3600,
  nextRunAt: Date.now() + 3600000,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  error: null,
  lease: null,
  leaseUntil: null,
};

test("offers pause for a completed task waiting on its next scheduled run", () => {
  const html = renderToStaticMarkup(
    <TaskActions
      task={task}
      settings={settings}
      busy={false}
      onAction={() => {}}
      onSchedule={() => {}}
    />,
  );
  expect(html).toContain("Pause schedule");
  expect(html).toContain("Edit schedule");
});

test("offers resume for a paused task without claiming to be running", () => {
  const html = renderToStaticMarkup(
    <TaskActions
      task={{ ...task, status: "paused" }}
      settings={settings}
      busy={false}
      onAction={() => {}}
      onSchedule={() => {}}
    />,
  );
  expect(html).toContain("Resume task");
  expect(html).not.toContain("Pause schedule");
});

test("labels an interrupted task for owner review before retry", () => {
  const html = renderToStaticMarkup(
    <TaskActions
      task={{ ...task, status: "interrupted" }}
      settings={settings}
      busy={false}
      onAction={() => {}}
      onSchedule={() => {}}
    />,
  );
  expect(html).toContain("Retry after review");
  expect(html).not.toContain("Pause task");
});
