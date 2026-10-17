/**
 * Dots → Agents one-shot ETL (fixture-based, pure).
 *
 * Maps legacy `dots` rows onto the landed Agents tables (`agents`,
 * `agent_profiles`, `agent_spaces`) per `docs/planning/19-phase5-dots-fold-mapping.md`
 * §3. Pure function over JSON: no database reads or writes. The caller inserts
 * the returned rows and records the returned report.
 *
 * Mapping decisions (doc 19 §3 + conflicts C1–C7):
 * - `id` → `dot-<uuid>` prefix (C2: never collide with `bot-1` fixtures).
 * - `spaceId` → default space FK; must be a member of `spaceIds`
 *   (`validateSpaceAccess` rule, `workspace.ts:175-181`). Otherwise skipped.
 * - `spaceIds[]` → `agent_spaces` rows, sorted + deduped; missing falls back
 *   to `[spaceId]` (the pre-ACL shape, D3).
 * - `name` (Dots 1–40) → `agents.name` (widen only, bound stays 80).
 * - `instructions` (≤2000) → `agent_profiles.roleDescription` AND
 *   `configuration.systemPrompt` (`built_in` mirror, `profile-store.ts:490`).
 *   Overlong instructions are SKIPPED and reported — never truncated (R3).
 * - `researchAllowed` / `memoryAllowed` int 0/1 → boolean, NULL when unset
 *   (ORBO has no equivalent; NULL = unset).
 * - `createdAt` epoch-ms → `Date` (timestamptz); roster keeps `ORDER BY`.
 * - `learningContainerId` → kept verbatim after the `shared/learning`
 *   lowercase-hyphen ≤64 validator; `skillDeliveryEnabled` requires it
 *   non-null and defaults to false. Bad slugs are skipped, not repaired.
 * - MCP tokens are NEVER imported: any token-bearing record throws
 *   `DotsImportRefusedError` before any other check (R1, C3 §7.5). Tokens
 *   belong encrypted in `credentials` (kind=`mcp`), never in this ETL.
 * - Every imported Dot → `type: "built_in"`, `visibility: "private"`,
 *   `ownerUserId` = bootstrap user, `title` = `name` (Dots has no title),
 *   `avatarSeed` = remapped id (the `create` convention), `deletedAt: null`
 *   (Dots were previously undeletable, C5).
 */
import { isLearningContainerId } from "../../../shared/learning";

/** One legacy dot as it appears in a `GET /workspace` export. */
export type DotsDotInput = {
  id: unknown;
  spaceId: unknown;
  spaceIds?: unknown;
  name: unknown;
  instructions: unknown;
  researchAllowed?: unknown;
  memoryAllowed?: unknown;
  createdAt: unknown;
  learningContainerId?: unknown;
  skillDeliveryEnabled?: unknown;
  mcpConnections?: unknown;
  connections?: unknown;
  [key: string]: unknown;
};

export type DotsImportInput = { dots: DotsDotInput[] } | DotsDotInput[];

export type DotsImportOptions = {
  /** Bootstrap `users.id`: Dots `ownerId` is a single-owner string (R2). */
  ownerUserId: string;
};

export type ImportedAgentRow = {
  id: string;
  name: string;
  type: "built_in";
  configuration: { systemPrompt: string };
  /** NULLABLE bool; null/absent = unset (ORBO has no equivalent). */
  researchAllowed?: boolean | null;
  /** NULLABLE bool; null/absent = unset (Memory owns enforcement). */
  memoryAllowed?: boolean | null;
  /** NULLABLE learning container slug; absent = null. */
  learningContainerId?: string | null;
  /** Present only when true (column is NOT NULL DEFAULT false). */
  skillDeliveryEnabled?: boolean;
  /** NULLABLE FK → spaces; the Dots default page destination. */
  defaultSpaceId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ImportedAgentProfileRow = {
  agentId: string;
  ownerUserId: string;
  title: string;
  roleDescription: string;
  avatarSeed: string;
  visibility: "private";
  deletedAt: null;
};

export type ImportedAgentSpaceRow = {
  agentId: string;
  spaceId: string;
};

export type DotsImportSkip = {
  dotId: string;
  reason: string;
};

export type DotsImportReport = {
  imported: number;
  skipped: DotsImportSkip[];
};

export type DotsImportResult = {
  agents: ImportedAgentRow[];
  agentProfiles: ImportedAgentProfileRow[];
  agentSpaces: ImportedAgentSpaceRow[];
  report: DotsImportReport;
};

export class DotsImportRefusedError extends Error {
  readonly dotId: string;

  constructor(dotId: string, detail: string) {
    super(
      `dots-import: refusing to import dot "${dotId}": ${detail} ` +
        `MCP token material must never be imported; encrypt it into ` +
        `credentials (kind=mcp) instead.`,
    );
    this.name = "DotsImportRefusedError";
    this.dotId = dotId;
  }
}

const TOKEN_KEYS = new Set([
  "token",
  "mcpToken",
  "authToken",
  "connectionToken",
  "secret",
  "apiKey",
]);

function describeId(value: unknown): string {
  return typeof value === "string" && value ? value : "<unknown>";
}

function hasTokenMaterial(dot: DotsDotInput): boolean {
  for (const [key, value] of Object.entries(dot)) {
    if (
      TOKEN_KEYS.has(key) &&
      typeof value === "string" &&
      value.trim() !== ""
    ) {
      return true;
    }
  }
  for (const field of ["mcpConnections", "connections"] as const) {
    const list = dot[field];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      if (typeof record.token === "string" && record.token.trim() !== "") {
        return true;
      }
      if (record.hasToken === true) return true;
    }
  }
  return false;
}

function toFlag(value: unknown): boolean | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (value === 1 || value === true) return true;
  if (value === 0 || value === false) return false;
  return "invalid";
}

function toSkillDelivery(value: unknown): boolean | "invalid" {
  if (value === undefined || value === null) return false;
  if (value === 1 || value === true) return true;
  if (value === 0 || value === false) return false;
  return "invalid";
}

function toSpaceList(spaceIds: unknown, spaceId: string): string[] | null {
  if (spaceIds === undefined || spaceIds === null) return [spaceId];
  if (!Array.isArray(spaceIds)) return null;
  const members = new Set<string>();
  for (const entry of spaceIds) {
    if (typeof entry !== "string" || entry.trim() === "") return null;
    members.add(entry);
  }
  return [...members].sort();
}

function toTimestamp(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Map Dots JSON onto Agents rows. Throws `DotsImportRefusedError` on any
 * token-bearing record, `Error` on a malformed envelope or options.
 * Per-record problems skip that record and land in `report.skipped`.
 */
export function importDots(
  input: DotsImportInput,
  opts: DotsImportOptions,
): DotsImportResult {
  if (
    !opts ||
    typeof opts.ownerUserId !== "string" ||
    opts.ownerUserId.trim() === ""
  ) {
    throw new Error(
      "dots-import: opts.ownerUserId must be a non-empty string.",
    );
  }
  const dots = Array.isArray(input) ? input : input?.dots;
  if (!Array.isArray(dots)) {
    throw new Error(
      'dots-import: input must be a dot array or an object with a "dots" array.',
    );
  }

  const agents: ImportedAgentRow[] = [];
  const agentProfiles: ImportedAgentProfileRow[] = [];
  const agentSpaces: ImportedAgentSpaceRow[] = [];
  const skipped: DotsImportSkip[] = [];

  for (const dot of dots) {
    if (typeof dot !== "object" || dot === null) {
      skipped.push({ dotId: "<unknown>", reason: "dot is not an object" });
      continue;
    }
    const dotId = describeId(dot.id);

    // Security gate first: refuse before any other check (R1).
    if (hasTokenMaterial(dot)) {
      throw new DotsImportRefusedError(
        dotId,
        "record carries MCP token material.",
      );
    }

    if (typeof dot.id !== "string" || dot.id.trim() === "") {
      skipped.push({ dotId, reason: "id must be a non-empty string" });
      continue;
    }
    const id = `dot-${dot.id}`;

    if (typeof dot.name !== "string" || dot.name.trim() === "") {
      skipped.push({
        dotId,
        reason: "name must be text between 1 and 80 characters",
      });
      continue;
    }
    if (dot.name.length > 80) {
      skipped.push({
        dotId,
        reason: "name exceeds 80 characters; widen covers Dots 1-40 only",
      });
      continue;
    }

    if (typeof dot.instructions !== "string" || dot.instructions === "") {
      skipped.push({ dotId, reason: "instructions must be non-empty text" });
      continue;
    }
    if (dot.instructions.length > 2000) {
      skipped.push({
        dotId,
        reason: `instructions exceed 2000 characters (${dot.instructions.length}); not truncated, needs owner review`,
      });
      continue;
    }

    const researchAllowed = toFlag(dot.researchAllowed);
    if (researchAllowed === "invalid") {
      skipped.push({
        dotId,
        reason: "researchAllowed must be 0/1 or boolean when present",
      });
      continue;
    }
    const memoryAllowed = toFlag(dot.memoryAllowed);
    if (memoryAllowed === "invalid") {
      skipped.push({
        dotId,
        reason: "memoryAllowed must be 0/1 or boolean when present",
      });
      continue;
    }

    const createdAt = toTimestamp(dot.createdAt);
    if (!createdAt) {
      skipped.push({ dotId, reason: "createdAt must be epoch-ms" });
      continue;
    }

    let learningContainerId: string | null = null;
    if (
      dot.learningContainerId !== undefined &&
      dot.learningContainerId !== null &&
      dot.learningContainerId !== ""
    ) {
      if (!isLearningContainerId(dot.learningContainerId)) {
        skipped.push({
          dotId,
          reason:
            "learningContainerId must be a lowercase-hyphen id of at most 64 characters",
        });
        continue;
      }
      learningContainerId = dot.learningContainerId;
    }

    const skillDeliveryEnabled = toSkillDelivery(dot.skillDeliveryEnabled);
    if (skillDeliveryEnabled === "invalid") {
      skipped.push({
        dotId,
        reason: "skillDeliveryEnabled must be 0/1 or boolean when present",
      });
      continue;
    }
    if (skillDeliveryEnabled && learningContainerId === null) {
      skipped.push({
        dotId,
        reason: "skillDeliveryEnabled requires a learningContainerId",
      });
      continue;
    }

    if (typeof dot.spaceId !== "string" || dot.spaceId.trim() === "") {
      skipped.push({ dotId, reason: "spaceId must be a non-empty string" });
      continue;
    }
    const spaceIds = toSpaceList(dot.spaceIds, dot.spaceId);
    if (!spaceIds || spaceIds.length === 0) {
      skipped.push({ dotId, reason: "spaceIds must be an array of space ids" });
      continue;
    }
    if (!spaceIds.includes(dot.spaceId)) {
      skipped.push({
        dotId,
        reason: `spaceId "${dot.spaceId}" is not a member of spaceIds`,
      });
      continue;
    }

    agents.push({
      id,
      name: dot.name,
      type: "built_in",
      configuration: { systemPrompt: dot.instructions },
      createdAt,
      updatedAt: createdAt,
      ...(researchAllowed !== null ? { researchAllowed } : {}),
      ...(memoryAllowed !== null ? { memoryAllowed } : {}),
      ...(learningContainerId !== null ? { learningContainerId } : {}),
      ...(skillDeliveryEnabled ? { skillDeliveryEnabled } : {}),
      defaultSpaceId: dot.spaceId,
    });

    agentProfiles.push({
      agentId: id,
      ownerUserId: opts.ownerUserId,
      title: dot.name,
      roleDescription: dot.instructions,
      avatarSeed: id,
      visibility: "private",
      deletedAt: null,
    });

    for (const spaceId of spaceIds) {
      agentSpaces.push({ agentId: id, spaceId });
    }
  }

  return {
    agents,
    agentProfiles,
    agentSpaces,
    report: { imported: agents.length, skipped },
  };
}
