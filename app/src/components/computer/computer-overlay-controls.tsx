import { Button } from "@/components/ui/button";
import { useComputerControl } from "@/lib/computers/use-control";
import { ComputerSecretForm } from "./computer-secret-form";

/**
 * The takeover states of the full-size view, in the four words that matter: pending, verifying,
 * granted, and the request that did not go through.
 *
 * The inline card keeps its own short lines about these same states; this one is the overlay's,
 * where a person is about to take or has just been given the wheel and needs the whole state, not
 * one sentence of it. The wheel itself stays in the row beside this bar, which is where the take
 * and hand-back actions already live.
 */
export function OverlayControls({
  computerId,
  /** Whether there is a live stream worth pausing: a settled record or a driven wheel has neither. */
  canPause,
  paused,
  onPauseChange,
}: {
  computerId: string;
  canPause: boolean;
  paused: boolean;
  onPauseChange: (paused: boolean) => void;
}) {
  const { control, busy, change } = useComputerControl(computerId);
  const status = control?.request?.status;
  /** Waiting is the pending state; taken means it was granted, and the rest did not go through. */
  const pending = Boolean(control?.requested);
  const granted = control?.holder === "human" && !control?.transitioning;
  const verifying = Boolean(control?.transitioning);
  const notGranted =
    !pending &&
    !granted &&
    !verifying &&
    (status === "expired" || status === "cancelled");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-sm">
        <span className="min-w-0 flex-1" role="status">
          {verifying ? (
            <span>
              Verifying the handover — finishing the current action first…
            </span>
          ) : pending ? (
            <span>
              <strong className="font-medium">Takeover requested.</strong>{" "}
              {control?.reason}{" "}
              <button
                type="button"
                className="underline"
                disabled={busy}
                onClick={() => void change?.("cancel")}
              >
                Cancel request
              </button>
            </span>
          ) : granted ? (
            <span className="text-muted-foreground">
              You have control — click and type on the page.
            </span>
          ) : notGranted ? (
            <span className="text-muted-foreground">
              The last takeover request did not go through. Ask again with the
              button beside this line.
            </span>
          ) : null}
        </span>
        {canPause ? (
          <Button
            aria-pressed={paused}
            disabled={busy}
            onClick={() => onPauseChange(!paused)}
            size="sm"
            type="button"
            variant={paused ? "default" : "outline"}
          >
            {paused ? "Resume live view" : "Pause live view"}
          </Button>
        ) : null}
      </div>
      {/*
        The verification prompt is the page asking for a secret; the form is the answer. Rendered
        here as well as on the card, because a person in the full-size view would otherwise have to
        leave it to type.
      */}
      {control?.secretWanted ? (
        <ComputerSecretForm
          computerId={computerId}
          wanted={control.secretWanted}
        />
      ) : null}
    </>
  );
}
