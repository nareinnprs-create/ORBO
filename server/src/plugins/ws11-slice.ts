/**
 * WS-11 first slice (09 §4): one `/`-invoked personal skill end to end.
 *
 * A deliberately small, in-memory governed path: a personal skill is
 * installed, granted to one Bot, invoked with `/slug` plus optional words,
 * resolved against visibility and the grant, and executed through the injected
 * model. Parse, resolve and execute are separate steps so each refusal names
 * its own rule; the result carries the skill's instructions and the model's
 * answer together.
 *
 * No network and no database here: the model arrives by injection and the
 * tests install a recording stub, the same seam shape as `ws10-slice`'s
 * transport. Learning containers and delivery are deferred to later slices —
 * nothing in this module names them.
 */

/** One personal (or deployment) skill, as the `/` menu offers it. */
export type Ws11Skill = {
  slug: string;
  title: string;
  summary: string;
  instructions: string;
  /** Whose it is. Null means the deployment's, offered to everybody. */
  ownerUserId: string | null;
};

/**
 * The model boundary of the slice, stubbed in tests and wired to the real
 * runner in a later slice.
 *
 * Narrower than any agent runner on purpose: this slice runs one skill, so
 * the model is asked to follow that skill's instructions for these words,
 * and nothing else.
 */
export type Ws11Model = {
  run(input: {
    skill: Ws11Skill;
    agentId: string;
    actorId: string;
    userText: string;
  }): Promise<string>;
};

/** One audit row, mirroring the store's `configuration.changed` payload shape. */
export type Ws11AuditEvent = {
  eventType: "skill.invoked" | "skill.invoke_rejected";
  targetType: "skill";
  targetId: string;
  payload: Record<string, unknown>;
};

/**
 * A refusal this slice authored: not an invocation, no such skill, somebody
 * else's skill, or a Bot that was never given it.
 *
 * Mirrors `PluginRefusedError`'s shape (`rule: null` — no policy rule refused
 * this) so callers can treat both alike when the DB-backed grants land in a
 * later slice.
 */
export class Ws11RefusedError extends Error {
  readonly rule: null = null;
  constructor(message: string) {
    super(message);
    this.name = "Ws11RefusedError";
  }
}

/**
 * The same slug rule as the skills route: lowercase letters, digits and
 * hyphens, 2 to 40 characters, starting and ending with a letter or digit.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/**
 * What `/` invoked, or null when the text is not a skill invocation at all.
 *
 * Only a leading `/slug` counts: plain chat, a bare `/`, and a `//` path all
 * read as null rather than as a skill named nothing. The slug match is case
 * sensitive, because slugs are lowercase and `/Standup` names no skill.
 */
export function parseSkillInvocation(
  text: string,
): { slug: string; args: string } | null {
  const leading = text.replace(/^\s+/, "");
  if (!leading.startsWith("/")) return null;
  const rest = leading.slice(1);
  if (rest === "" || rest.startsWith("/")) return null;
  const match = /^([a-z0-9][a-z0-9-]{0,38}[a-z0-9])(?:\s+(.*))?$/.exec(rest);
  if (!match?.[1]) return null;
  return { slug: match[1], args: (match[2] ?? "").trim() };
}

export type Ws11SliceOptions = {
  /** Where audit rows go; kept in memory when absent. */
  auditSink?: (event: Ws11AuditEvent) => void;
  /** The model boundary; invocations fail closed until one is installed. */
  model?: Ws11Model | null;
};

export type Ws11InvokeResult = {
  slug: string;
  instructions: string;
  userText: string;
  output: string;
};

/**
 * The slice's own state: one skill and the agents granted it.
 *
 * A factory rather than module-level bindings so each test owns its registry
 * and nothing leaks between files under Bun's single-process run.
 */
export function createWs11Slice(options: Ws11SliceOptions = {}) {
  let skill: Ws11Skill | null = null;
  /** The agents granted the slice's skill. */
  const grants = new Set<string>();
  const auditTrail: Ws11AuditEvent[] = [];
  let model: Ws11Model | null = options.model ?? null;

  const audit = (event: Ws11AuditEvent) => {
    auditTrail.push(event);
    options.auditSink?.(event);
  };

  function resolveSkill(input: {
    slug: string;
    agentId: string;
    actorId: string;
    isAdmin?: boolean;
  }): Ws11Skill {
    const actor = input.actorId.trim() === "" ? "unattributed" : input.actorId;
    if (skill === null || skill.slug !== input.slug) {
      throw new Ws11RefusedError(`There is no skill called ${input.slug}.`);
    }
    if (
      skill.ownerUserId !== null &&
      skill.ownerUserId !== input.actorId &&
      !input.isAdmin
    ) {
      const reason = `${input.slug} is somebody else's skill.`;
      audit({
        eventType: "skill.invoke_rejected",
        targetType: "skill",
        targetId: input.slug,
        payload: {
          actor,
          bot: input.agentId,
          skill: input.slug,
          refusal: "not_visible",
          reason,
        },
      });
      throw new Ws11RefusedError(reason);
    }
    if (!grants.has(input.agentId)) {
      const reason = `This Bot has not been given the skill ${input.slug}.`;
      audit({
        eventType: "skill.invoke_rejected",
        targetType: "skill",
        targetId: input.slug,
        payload: {
          actor,
          bot: input.agentId,
          skill: input.slug,
          refusal: "not_granted",
          reason,
        },
      });
      throw new Ws11RefusedError(reason);
    }
    return { ...skill };
  }

  return {
    /** The audit rows written so far, oldest first. */
    auditTrail,

    /** Swap the model; null uninstalls it and invocations fail closed again. */
    useModel(next: Ws11Model | null): void {
      model = next;
    },

    /**
     * Install the slice's one personal skill.
     *
     * Exactly one, and the first to take effect: the `/` namespace is shared
     * and first to take a name keeps it, so a second install is a caller that
     * has outgrown this slice rather than a state to hold.
     */
    installSkill(input: {
      slug: string;
      title: string;
      summary?: string;
      instructions: string;
      ownerUserId: string | null;
    }): Ws11Skill {
      if (skill !== null) {
        throw new Ws11RefusedError(
          "This slice holds one skill, which is already installed.",
        );
      }
      if (!SLUG_PATTERN.test(input.slug)) {
        throw new Ws11RefusedError(
          "A slug is lower-case letters, numbers and hyphens.",
        );
      }
      if (input.title.trim() === "") {
        throw new Ws11RefusedError("A skill needs a title.");
      }
      if (input.instructions.trim() === "") {
        throw new Ws11RefusedError("A skill needs instructions.");
      }
      if (input.ownerUserId !== null && input.ownerUserId.trim() === "") {
        throw new Ws11RefusedError(
          "A personal skill names the person it is for.",
        );
      }
      skill = {
        slug: input.slug,
        title: input.title.trim(),
        summary: input.summary ?? "",
        instructions: input.instructions.trim(),
        ownerUserId: input.ownerUserId,
      };
      return { ...skill };
    },

    /** Grant one agent the slice's skill. */
    grant(agentId: string): { slug: string; agentId: string } {
      if (skill === null) {
        throw new Ws11RefusedError(
          "There is no skill to grant until one is installed.",
        );
      }
      if (agentId.trim() === "") {
        throw new Ws11RefusedError("A grant names the agent it is for.");
      }
      grants.add(agentId);
      return { slug: skill.slug, agentId };
    },

    /**
     * What one agent is offered for one person: the skill, or nothing when it
     * is somebody else's or the agent was never given it.
     */
    listForAgent(
      agentId: string,
      actorId: string,
      isAdmin = false,
    ): Ws11Skill[] {
      if (skill === null) return [];
      if (
        skill.ownerUserId !== null &&
        skill.ownerUserId !== actorId &&
        !isAdmin
      ) {
        return [];
      }
      if (!grants.has(agentId)) return [];
      return [{ ...skill }];
    },

    /**
     * Resolve a named skill for one person on one agent: it exists, they may
     * see it, and the agent was given it.
     *
     * A name nobody installed is refused without an audit row claiming a
     * decision about it: there is no skill to decide on.
     */
    resolve: resolveSkill,

    /**
     * Run one `/`-invoked personal skill end to end: parse the text, resolve
     * the skill, execute through the model stub, and return its answer.
     *
     * Decide, record, then act — visibility and the grant are checked before
     * anything reaches the model, so a skill the person may not see never
     * spends a model call. The refusal is audited before the throw, because
     * every way out of that branch is the throw and a row written after it
     * is never written.
     */
    async invoke(input: {
      text: string;
      agentId: string;
      actorId: string;
      isAdmin?: boolean;
    }): Promise<Ws11InvokeResult> {
      const parsed = parseSkillInvocation(input.text);
      if (!parsed) {
        throw new Ws11RefusedError(
          "That is not a skill invocation. Start with / and the skill name.",
        );
      }
      const resolved = resolveSkill({
        slug: parsed.slug,
        agentId: input.agentId,
        actorId: input.actorId,
        ...(input.isAdmin === undefined ? {} : { isAdmin: input.isAdmin }),
      });
      if (model === null) {
        throw new Ws11RefusedError(
          "No model is installed, so the skill cannot run.",
        );
      }
      const actor =
        input.actorId.trim() === "" ? "unattributed" : input.actorId;
      const output = await model.run({
        skill: resolved,
        agentId: input.agentId,
        actorId: input.actorId,
        userText: parsed.args,
      });
      audit({
        eventType: "skill.invoked",
        targetType: "skill",
        targetId: resolved.slug,
        payload: {
          actor,
          bot: input.agentId,
          skill: resolved.slug,
          userText: parsed.args,
        },
      });
      return {
        slug: resolved.slug,
        instructions: resolved.instructions,
        userText: parsed.args,
        output,
      };
    },
  };
}

export type Ws11Slice = ReturnType<typeof createWs11Slice>;
