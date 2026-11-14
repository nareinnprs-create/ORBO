import { useId, useState } from "react";
import { supplySecret } from "@/lib/computers/control";
import { useComputerControl } from "@/lib/computers/use-control";

/**
 * The page is asking for a secret, and this is the one box that answers it.
 *
 * Extracted from the card it used to live under so the full-size view can offer the same form:
 * a person in the overlay who closed the card otherwise had no way in at all. Values go directly
 * to the page path and are never included in the conversation; audit records that a secret was
 * supplied, not the value.
 */
export function ComputerSecretForm({
  computerId,
  wanted,
  /** Called once a send has been attempted, so a watcher can keep the screen live briefly. */
  onSent,
}: {
  computerId: string;
  wanted: string;
  onSent?: () => void;
}) {
  const { refresh } = useComputerControl(computerId);
  // The form can be mounted twice (card and overlay at once); one id each.
  const fieldId = useId();
  /** Held only until it is sent. Never lifted into a URL, a log, or anything that outlives this form. */
  const [secret, setSecret] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  return (
    <form
      className="border-t bg-muted/40 px-3 py-2 text-sm"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!secret || sending) return;
        setSending(true);
        onSent?.();
        const result = await supplySecret(computerId, secret);
        setSending(false);
        // Clear even on failure so plaintext is not left in the DOM.
        setSecret("");
        setProblem(result.ok ? null : (result.error ?? null));
        await refresh?.();
      }}
    >
      <label className="block" htmlFor={fieldId}>
        <span className="font-medium">The assistant needs </span>
        <span>{wanted}</span>
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={fieldId}
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Typed here, never shown to the assistant"
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={!secret || sending}
          className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send to the page"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        This goes straight to the page. It is not shown in the conversation and
        the assistant never receives it.
      </p>
      {problem ? (
        <p className="mt-1 text-xs text-destructive">{problem}</p>
      ) : null}
    </form>
  );
}
