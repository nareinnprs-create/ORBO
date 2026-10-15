import { cn } from "./utils";

/*
 * Canonical LiveWaveform. Props mirror
 * app/src/components/ui/live-waveform.tsx (`stream`/`processing`/`height`/
 * `className`, same `role="img"` + `aria-label` announcement shape) so a
 * future port is mechanical.
 *
 * Dependency-light by design: static bars, no `motion/react`, no
 * AudioContext/analyser, no canvas. Deliberate divergences: `stream` is
 * accepted and reflected as `data-has-stream` but never opened — the bars are
 * a fixed deterministic set, so there is no live amplitude and no microphone
 * handling (the app never opens or stops the mic either; it only visualizes
 * the caller's stream, which has no state here); `processing` drives a
 * staggered CSS pulse instead of the canvas idle wave and honors
 * `prefers-reduced-motion` via `motion-reduce:animate-none` (no
 * `useReducedMotion` hook); the `unavailable` fallback row is dropped
 * (nothing can fail without an AudioContext); bar color is the royal-purple
 * AI token with hex fallback, and the edge fade is a CSS mask (the canvas
 * per-bar alpha in the app). No ORBO token wiring is needed beyond the bars —
 * layout classes match the app scale 1:1.
 */

const LIVE_WAVEFORM_BAR_COUNT = 48;

/**
 * Deterministic center-weighted bar heights (fraction of `height`). Each bar
 * carries a stable id: the set is fixed and never reorders, so the ids are
 * safe React keys (no index keys).
 */
const LIVE_WAVEFORM_BARS: readonly { id: string; fraction: number }[] =
  Array.from({ length: LIVE_WAVEFORM_BAR_COUNT }, (_, i) => {
    const position =
      Math.abs(i - LIVE_WAVEFORM_BAR_COUNT / 2) / (LIVE_WAVEFORM_BAR_COUNT / 2);
    return {
      id: `live-waveform-bar-${i}`,
      fraction: Math.max(
        0.12,
        (0.55 + 0.45 * Math.sin(i * 0.9)) * (1 - position * 0.75),
      ),
    };
  });

function LiveWaveform({
  stream,
  processing = false,
  height = 32,
  className,
}: {
  stream?: MediaStream;
  processing?: boolean;
  height?: number;
  className?: string;
}) {
  return (
    <div
      data-slot="live-waveform"
      data-processing={processing ? true : undefined}
      data-has-stream={stream ? true : undefined}
      className={cn(
        "relative flex w-full min-w-0 items-center gap-[3px] overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]",
        className,
      )}
      style={{ height }}
      role="img"
      aria-label={processing ? "Processing audio" : "Live audio waveform"}
    >
      {LIVE_WAVEFORM_BARS.map((bar, i) => (
        <span
          key={bar.id}
          aria-hidden="true"
          style={{
            height: `${Math.max(3, bar.fraction * height)}px`,
            animationDelay: processing ? `${(i % 8) * 120}ms` : undefined,
          }}
          className={cn(
            "w-[3px] shrink-0 rounded-full bg-[var(--orbo-purple-500,#8B5CF6)]",
            processing && "animate-pulse motion-reduce:animate-none",
          )}
        />
      ))}
    </div>
  );
}

export { LiveWaveform };
