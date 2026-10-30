/**
 * The harness refuses to boot without the server's token (the same posture as
 * agent-orbo-bot/src/index.ts), so any test file that imports it must present one first: import
 * this file above the harness import, and the variable exists before the harness module executes.
 * Only fills an absent value - a token the environment already carries wins, and the
 * boot-refusal probe builds its child environment from scratch, so it never sees this one.
 */
process.env.ORBO_MANAGED_AGENT_TOKEN ??= "test-token";
