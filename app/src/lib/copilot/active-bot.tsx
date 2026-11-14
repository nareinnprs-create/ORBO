import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Which Bot the surface in front of you is driving.
 *
 * The computer tools are registered once for the whole app, but a computer belongs to a Bot, and a supervisor gives
 * each one its own browser profile and its own egress, and the server picks which by the id in the
 * URL.
 *
 * Tool handlers read the ref because a handler outlives the render that registered it. Components
 * read state because grants and renderers must re-render when the active Bot changes.
 */

const DEFAULT_BOT_ID = "default";

type BotHolder = { current: string };

const ActiveBotContext = createContext<BotHolder | null>(null);
const ActiveBotValueContext = createContext<{
  botId: string;
  announce: (botId: string) => void;
} | null>(null);

export function ActiveBotProvider({ children }: { children: ReactNode }) {
  const holder = useRef<BotHolder>({ current: DEFAULT_BOT_ID });
  const [botId, setBotId] = useState(DEFAULT_BOT_ID);
  const value = useRef({ botId, announce: setBotId });
  value.current = { botId, announce: setBotId };

  return (
    <ActiveBotContext.Provider value={holder.current}>
      <ActiveBotValueContext.Provider value={value.current}>
        {children}
      </ActiveBotValueContext.Provider>
    </ActiveBotContext.Provider>
  );
}

/**
 * Declare the Bot this surface drives, for as long as it is mounted.
 *
 * Restores what it found on unmount, so leaving a channel does not leave its Bot addressed by
 * whatever mounts next.
 */
export function useActiveBot(botId: string | undefined): void {
  const holder = useContext(ActiveBotContext);
  const value = useContext(ActiveBotValueContext);
  useEffect(() => {
    if (!holder) return;
    const previous = holder.current;
    holder.current = botId ?? DEFAULT_BOT_ID;
    value?.announce(botId ?? DEFAULT_BOT_ID);
    return () => {
      holder.current = previous;
      value?.announce(previous);
    };
  }, [holder, value, botId]);
}

/** The holder itself, to be read inside a handler at the moment it runs. */
export function useActiveBotHolder(): BotHolder {
  return useContext(ActiveBotContext) ?? { current: DEFAULT_BOT_ID };
}

/** The active Bot as a value, for anything that has to re-render when it changes. */
export function useActiveBotId(): string {
  return useContext(ActiveBotValueContext)?.botId ?? DEFAULT_BOT_ID;
}

/**
 * The active Bot when a surface has declared one, and undefined while the placeholder holds.
 *
 * The placeholder exists so a handler always has something to route with, but it is not a Bot: no
 * package registers an agent by that name, and the server answers 404 for it. The short-circuit on
 * that is now enforced at both points where a poll can be scheduled, rather than left as a
 * convention every caller has to restate:
 *
 * - {@link isPlaceholderBot} is the gate every Bot-scoped poll factory passes in its `enabled`, so
 *   an id that is the placeholder can never schedule its first request, however a caller hands it
 *   in.
 * - {@link botPollInterval} is the cadence every Bot-scoped poll runs on: honest while the Bot
 *   answers, and backed off to a long interval once the query is failing with nothing ever received
 *   — the same guaranteed miss, from a Bot that was deleted or a read that keeps refusing — so no
 *   failing Bot-scoped read keeps costing a request every few seconds for the life of the surface.
 *
 * The name is already reserved in practice: an agents.yaml entry called "default" would be
 * indistinguishable from the placeholder in every handler that reads the holder.
 */
export function declaredBotId(botId: string): string | undefined {
  return botId === DEFAULT_BOT_ID ? undefined : botId;
}

/** Whether a Bot-scoped read would be asking the holder's placeholder, which the server 404s. */
export function isPlaceholderBot(botId: string): boolean {
  return botId === DEFAULT_BOT_ID;
}

/** How long a Bot-scoped poll that has never once answered waits between tries. */
const UNANSWERED_BOT_POLL_MS = 5 * 60_000;

/**
 * The cadence for a Bot-scoped poll: `baseMs` while the Bot has ever answered, one try every
 * {@link UNANSWERED_BOT_POLL_MS} while it is failing with nothing on file.
 *
 * Data is the proof of life, not the last attempt: a query that answered once keeps its usual
 * interval through a failed refetch, because TanStack keeps its last good `data` across those and a
 * snapshot arriving late is worse than a snapshot arriving stale. Only never-answered queries —
 * `data` still undefined under an error — are throttled, which is exactly the set whose every
 * future poll is a predicted miss: a granted read that permanently 404s (a deleted Bot the channel
 * still names) or the placeholder handed to a factory that forgot to gate on
 * {@link isPlaceholderBot}. `false` from the caller's own polling conditions still wins; this
 * answers only what the cadence would be.
 */
export function botPollInterval(
  baseMs: number,
): (query: { state: { data?: unknown; error: unknown } }) => number | false {
  return ({ state: { data, error } }) =>
    data === undefined && error !== null ? UNANSWERED_BOT_POLL_MS : baseMs;
}

/** As useActiveBotId, for callers that should do nothing while the placeholder holds. */
export function useDeclaredBotId(): string | undefined {
  return declaredBotId(useActiveBotId());
}
