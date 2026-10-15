import * as React from "react";

import { Button } from "./button";
import { cn } from "./utils";

/*
 * Canonical Composer. Export names and `data-slot`s mirror
 * app/src/components/channels/composer/composer.tsx (`Composer`, same
 * `compact`/`disabled`/`pending` + send/stop/voice affordances) so a future
 * port is mechanical.
 *
 * Dependency-light by design: native <div>/<form>/<textarea>, local Button,
 * no `@copilotkit/react-core`, no `prompt-area`, no Tabler icons (inline SVG
 * plus/arrow/stop/waveform). Deliberate divergences (same styled-shells
 * category as the canonical Select/Dialog): no mention/command triggers
 * (`agents`/`commands` are not accepted); no PromptArea segments — a native
 * <textarea> holds plain text (`value`/`defaultValue`/`onChange` strings,
 * `placeholder`; `initialValue` seeds the box once, as a string; no
 * `autoFocus` — focus the editor programmatically via ref instead)
 * with no auto-grow (fixed rows, sized via `editorClassName`); `onSubmit`
 * receives the plain text rather than the app's structured `ComposerDraft`
 * (no attachments to carry); no attachments (`channelId` uploads, strip,
 * picker, per-message cap, `droppedAttachments`/`queuedAttachmentCount` —
 * the attach button is a decorative control), no dictation paste/drop/drag
 * handling (the mic renders statically), no queue (`onQueue` not accepted —
 * mid-turn sends are refused, the app's no-queue behavior); `voiceCall` keeps
 * the app `{ active, supported, onStart }` shape and swaps send for a call
 * button while the box is empty (same rule as the app); `stoppable` defaults
 * to `pending` (same as the app) with `onStop` swapping send for stop. No
 * ORBO token overrides — frame/radius classes resolve to the same values as
 * tokens.ts, so no class churn is needed at port time (same call as the
 * canonical Input).
 */

type ComposerVoiceCall = {
  active: boolean;
  supported: boolean;
  onStart(): void;
};

type ComposerProps = {
  className?: string;
  /**
   * Classes for the editor itself rather than the frame. `className` styles
   * the box — border, background, width; the type inside it is the
   * textarea's, so changing it goes through here, where tailwind-merge lets
   * it beat the built-in `text-sm` (same split as the app's
   * `editorClassName`).
   */
  editorClassName?: string;
  compact?: boolean;
  voiceCall?: ComposerVoiceCall;
  onSubmit?: (text: string) => void;
  /** Stop the Bot mid-answer; while stoppable, the send button becomes a stop button. */
  onStop?: () => void;
  disabled?: boolean;
  /**
   * A turn is in flight. It gates sending, not writing: the box stays
   * editable throughout (same as the app).
   */
  pending?: boolean;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  initialValue?: string;
  onChange?: (value: string) => void;
  /**
   * There is a run on the wire for Stop to reach. Defaults to `pending`
   * (same as the app).
   */
  stoppable?: boolean;
};

function ComposerPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ComposerSendIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 19V5m-7 7 7-7 7 7" />
    </svg>
  );
}

function ComposerStopIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

function ComposerWaveformIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 10v3" />
      <path d="M6 6v11" />
      <path d="M10 3v18" />
      <path d="M14 8v7" />
      <path d="M18 5v13" />
      <path d="M22 10v3" />
    </svg>
  );
}

function Composer({
  className,
  editorClassName,
  compact = false,
  voiceCall,
  onSubmit,
  onStop,
  disabled = false,
  pending = false,
  placeholder = "Ask anything",
  value,
  defaultValue,
  initialValue,
  onChange,
  stoppable,
}: ComposerProps) {
  const [internal, setInternal] = React.useState(
    initialValue ?? defaultValue ?? "",
  );
  const text = value ?? internal;
  const isBusy = pending;
  const empty = text.trim().length === 0;
  const sendable = !disabled && !empty;
  /**
   * Stop is available once there is a run for it to reach, and it gives way
   * to nothing here: without a queue there is no parking state, so stop wins
   * over send whenever it is armed (same single-button rule as the app).
   */
  const canStop = Boolean(onStop) && (stoppable ?? pending);
  const sendLabel = "Send message";

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sendable || !onSubmit) return;
    onSubmit(text);
    if (value === undefined) setInternal("");
  };

  const actionClassName = cn(
    "rounded-full p-0",
    compact ? "size-8 self-end" : "size-7",
  );

  let primaryAction: React.ReactNode;
  if (canStop) {
    primaryAction = (
      <Button
        aria-label="Stop the Bot"
        className={actionClassName}
        onClick={onStop}
        size="icon"
        type="button"
      >
        <ComposerStopIcon className="size-3" />
      </Button>
    );
  } else if (voiceCall && empty) {
    primaryAction = (
      <Button
        aria-label={voiceCall.active ? "Show voice call" : "Start voice call"}
        title={
          voiceCall.supported
            ? voiceCall.active
              ? "Show voice call"
              : "Call this agent"
            : "Voice calls need HTTPS or localhost and microphone support"
        }
        className={actionClassName}
        disabled={disabled || !voiceCall.supported}
        onClick={voiceCall.onStart}
        size="icon"
        type="button"
      >
        <ComposerWaveformIcon className="size-4" />
      </Button>
    );
  } else {
    primaryAction = (
      <Button
        aria-label={sendLabel}
        className={actionClassName}
        disabled={!sendable || !onSubmit}
        size="icon"
        type="submit"
      >
        <ComposerSendIcon className="size-3.5" />
      </Button>
    );
  }

  const editor = (
    <textarea
      data-slot="composer-editor"
      aria-label="Message"
      disabled={disabled}
      placeholder={placeholder}
      rows={compact ? 1 : 3}
      value={text}
      onChange={handleChange}
      className={cn(
        "min-w-0 resize-none border-0 bg-transparent p-0 text-sm shadow-none outline-none placeholder:text-muted-foreground disabled:opacity-50",
        compact ? "flex-1" : "w-full",
        editorClassName,
      )}
    />
  );

  const attachButton = (
    <Button
      aria-label="Attach a file"
      className={compact ? "self-end" : "size-7 rounded-full p-0"}
      disabled={disabled}
      size="icon"
      type="button"
      variant="ghost"
    >
      <ComposerPlusIcon className={compact ? "size-5" : "size-4"} />
    </Button>
  );

  const dictateButton = (
    <Button
      aria-label="Dictate"
      className={compact ? "self-end" : undefined}
      disabled={disabled}
      size="icon"
      type="button"
      variant="ghost"
    >
      <ComposerWaveformIcon className="size-4" />
    </Button>
  );

  if (compact) {
    return (
      <div
        data-slot="composer"
        data-compact={compact ? true : undefined}
        className={cn("flex flex-col", className)}
      >
        <form
          data-slot="composer-form"
          aria-busy={isBusy}
          onSubmit={handleSubmit}
          className="flex min-h-14 flex-col rounded-2xl border border-border bg-card px-3 py-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        >
          <div className="flex items-center gap-3">
            {attachButton}
            {editor}
            {dictateButton}
            {primaryAction}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div data-slot="composer" className={cn("flex w-xl flex-col", className)}>
      <form
        data-slot="composer-form"
        aria-busy={isBusy}
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-2xl border border-border bg-card"
      >
        <div className="p-3">
          <div className="grow pb-2">{editor}</div>
          <div className="flex items-center justify-between">
            {attachButton}
            <div className="flex items-center gap-1">
              {dictateButton}
              {primaryAction}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export { Composer, type ComposerProps, type ComposerVoiceCall };
