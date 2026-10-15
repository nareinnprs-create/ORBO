import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical Avatar family (`Avatar` + `AvatarGroup`).
 *
 * There is no `ui/avatar.tsx` in the app — the sources are
 * `agents/abstract-avatar.tsx` (`AbstractAvatar`: `name`/`seed`/`size`) and
 * `channels/avatar.tsx` (`ChannelAvatar`: `participantIds`/`size`/`typing`,
 * group faces, typing badge). Per 04-design-system.md §3/§6 both are
 * REPLACED by the ORBO brand mark: no `boring-avatars` dependency here.
 *
 * Dependency-light by design: native spans, no image generation. A face is
 * deterministic initials on a royal-purple / blue-grey token pair (hex
 * fallbacks, contrast-paired) selected by hashing `seed ?? name`, in a
 * rounded-full shell (`role="img"` + `aria-label`, inner drawing
 * `aria-hidden` — same announcement shape as `AbstractAvatar`). `AvatarGroup`
 * ports the `ChannelAvatar` layout (first two/three faces overlapping in the
 * avatar's own square, mask cutouts leaving a background-agnostic gap) and
 * `typing` ports the roster working indicator (three bouncing dots +
 * screen-reader text). The badge sits outside the clipped face so it is
 * never cut off (minor structural difference from `ChannelAvatar`, whose
 * generated SVG is clipped by an ancestor icon selector instead).
 */

const AVATAR_TONES = [
  "bg-[var(--orbo-purple-100,#EDE9FE)] text-[var(--orbo-purple-800,#4C1D95)]",
  "bg-[var(--orbo-purple-200,#DDD6FE)] text-[var(--orbo-purple-900,#2E1065)]",
  "bg-[var(--orbo-grey-200,#D3DAE3)] text-[var(--orbo-grey-700,#363F4D)]",
  "bg-[var(--orbo-purple-600,#6D28D9)] text-white",
] as const;

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

function avatarHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function AvatarTypingIndicator() {
  return (
    <span className="absolute -right-0.5 -bottom-0.5 flex items-center gap-0.5 rounded-full bg-[var(--orbo-grey-100,#E8ECF1)] p-0.5 ring-2 ring-[var(--orbo-grey-100,#E8ECF1)]">
      <span className="sr-only">Working…</span>
      <span className="size-1 animate-bounce rounded-full bg-[var(--orbo-purple-600,#6D28D9)] [animation-delay:-0.3s]" />
      <span className="size-1 animate-bounce rounded-full bg-[var(--orbo-purple-600,#6D28D9)] [animation-delay:-0.15s]" />
      <span className="size-1 animate-bounce rounded-full bg-[var(--orbo-purple-600,#6D28D9)]" />
    </span>
  );
}

function Avatar({
  name,
  seed,
  size = 32,
  typing = false,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  name: string;
  seed?: string;
  size?: number;
  typing?: boolean;
}) {
  const tone = AVATAR_TONES[avatarHash(seed ?? name) % AVATAR_TONES.length];
  return (
    <span
      role="img"
      aria-label={name}
      data-slot="avatar"
      style={{ height: size, width: size }}
      className={cn("relative inline-flex shrink-0 rounded-full", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}
        className={cn(
          "flex size-full items-center justify-center overflow-hidden rounded-full font-medium select-none",
          tone,
        )}
      >
        {avatarInitials(name)}
      </span>
      {typing ? <AvatarTypingIndicator /> : null}
    </span>
  );
}

/** Where each face sits in a group's avatar, as fractions of its size. */
const AVATAR_GROUP_LAYOUTS = {
  2: {
    diameter: 0.68,
    at: [
      [0, 0],
      [0.32, 0.32],
    ],
  },
  3: {
    diameter: 0.56,
    at: [
      [0.22, 0],
      [0, 0.44],
      [0.44, 0.44],
    ],
  },
} as const;

function AvatarGroup({
  names,
  size = 32,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  names: string[];
  size?: number;
}) {
  const shown = names.slice(0, 3);
  if (shown.length <= 1) {
    return (
      <div
        data-slot="avatar-group"
        style={{ height: size, width: size }}
        className={cn("relative", className)}
        {...props}
      >
        {shown.length === 1 ? <Avatar name={shown[0]} size={size} /> : null}
      </div>
    );
  }
  const layout = AVATAR_GROUP_LAYOUTS[shown.length === 2 ? 2 : 3];
  const diameter = Math.round(size * layout.diameter);
  const gap = Math.max(1, size * 0.05);
  const at = layout.at.map(([x, y]) => [x * size, y * size]);
  return (
    <div
      data-slot="avatar-group"
      style={{ height: size, width: size }}
      className={cn("relative", className)}
      {...props}
    >
      <div className="relative size-full">
        {shown.map((id, i) => {
          const cuts = at.slice(i + 1).map(([x, y]) => {
            const cx = x - at[i][0] + diameter / 2;
            const cy = y - at[i][1] + diameter / 2;
            const r = diameter / 2 + gap;
            return `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r}px, #000 ${r + 0.5}px)`;
          });
          const mask = cuts.length > 0 ? cuts.join(", ") : undefined;
          return (
            <div
              className="absolute overflow-hidden rounded-full"
              key={id}
              style={{
                left: at[i][0],
                top: at[i][1],
                height: diameter,
                width: diameter,
                maskImage: mask,
                WebkitMaskImage: mask,
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }}
            >
              <Avatar name={id} size={diameter} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { Avatar, AvatarGroup };
