import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { AuditEventInput } from "../src/audit";
import {
  createCredential,
  CredentialRefusedError,
  decryptCredentialForUse,
  resolveModelApiKey,
  revokeCredential,
  rotateCredential,
  type CredentialStore,
  type CredentialStoreValue,
} from "../src/credentials";

const encryptionKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

type VaultRow = {
  id: string;
  kind: CredentialStoreValue["kind"];
  provider: string;
  keyId: string;
  metadata: Record<string, unknown>;
  encryptedValue: string;
  revokedAt: Date | null;
};

/**
 * In-memory stand-in for `createCredentialStore`, with the same observable
 * rules: one live credential per key, rotate revokes-then-inserts atomically,
 * and only a live row can be revoked or read as usable. No database involved.
 */
function createInMemoryVault() {
  const rows = new Map<string, VaultRow>();

  const liveByKey = (key: {
    kind: VaultRow["kind"];
    provider: string;
    keyId: string;
  }) => {
    for (const row of rows.values()) {
      if (
        row.revokedAt === null &&
        row.kind === key.kind &&
        row.provider === key.provider &&
        row.keyId === key.keyId
      ) {
        return row;
      }
    }
    return null;
  };

  const store: CredentialStore = {
    create: async (value) => {
      if (liveByKey(value)) {
        throw new Error("duplicate live credential for key");
      }
      const id = randomUUID();
      rows.set(id, { ...value, id, revokedAt: null });
      return { id, revokedAt: null };
    },
    updateSecret: async (id, encryptedValue) => {
      const row = rows.get(id);
      if (!row || row.revokedAt) {
        throw new Error("Credential was not found or is revoked");
      }
      row.encryptedValue = encryptedValue;
    },
    rotate: async (input) => {
      const previous = rows.get(input.previousCredentialId);
      if (!previous) {
        throw new CredentialRefusedError(
          "Previous credential was not found",
          404,
        );
      }
      if (previous.revokedAt) {
        throw new CredentialRefusedError(
          "Previous credential is already revoked",
          409,
        );
      }
      if (
        previous.kind !== input.kind ||
        previous.provider !== input.provider ||
        previous.keyId !== input.keyId
      ) {
        throw new CredentialRefusedError(
          "Previous credential does not match the input's kind, provider or keyId",
          409,
        );
      }
      previous.revokedAt = new Date();
      const id = randomUUID();
      rows.set(id, {
        id,
        kind: input.kind,
        provider: input.provider,
        keyId: input.keyId,
        metadata: input.metadata,
        encryptedValue: input.encryptedValue,
        revokedAt: null,
      });
      return { id, revokedAt: null };
    },
    revoke: async (id) => {
      const row = rows.get(id);
      if (!row || row.revokedAt) {
        throw new CredentialRefusedError(
          "Credential was not found or already revoked",
          404,
        );
      }
      row.revokedAt = new Date();
      return row.revokedAt;
    },
    isLive: async (id) => {
      const row = rows.get(id);
      return row !== undefined && row.revokedAt === null;
    },
    findLiveByKey: async (key) => {
      const row = liveByKey(key);
      return row ? { id: row.id } : null;
    },
  };

  return {
    store,
    readSecret: async (id: string) => {
      const row = rows.get(id);
      return row
        ? { encryptedValue: row.encryptedValue, revokedAt: row.revokedAt }
        : null;
    },
    readModelSecret: async (input: { provider: string; keyId: string }) => {
      for (const row of rows.values()) {
        if (
          row.revokedAt === null &&
          row.kind === "model" &&
          row.provider === input.provider &&
          row.keyId === input.keyId
        ) {
          return { encryptedValue: row.encryptedValue };
        }
      }
      return null;
    },
  };
}

describe("vault roundtrip (model credential)", () => {
  test("write → read-back → rotate (old revoked, new works) → revoke", async () => {
    const vault = createInMemoryVault();
    const audited: AuditEventInput[] = [];
    const service = {
      encryptionKey,
      store: vault.store,
      auditStore: {
        insert: async (event: AuditEventInput) => {
          audited.push(event);
        },
      },
    };
    const keyId = `vault-roundtrip-${randomUUID()}`;
    const firstSecret = `sk-first-${randomUUID()}`;
    const secondSecret = `sk-second-${randomUUID()}`;

    // 1. Write one `model` credential.
    const created = await createCredential(service, {
      kind: "model",
      provider: "openai",
      keyId,
      metadata: {},
      plaintext: firstSecret,
      actorUserId: "admin",
    });
    expect(created.revokedAt).toBeNull();

    // 2. Read it back: the vault decrypts to exactly what was written, and the
    // stored envelope never holds the plaintext.
    const raw = await vault.readSecret(created.id);
    expect(raw?.revokedAt).toBeNull();
    expect(raw?.encryptedValue).not.toContain(firstSecret);
    await expect(
      decryptCredentialForUse(encryptionKey, vault, created.id),
    ).resolves.toBe(firstSecret);
    await expect(
      resolveModelApiKey({
        encryptionKey,
        reader: vault,
        provider: "openai",
        keyId,
        environment: {},
      }),
    ).resolves.toBe(firstSecret);

    // 3. Rotate: the old row is revoked and unusable, the new row decrypts to
    // the replacement secret.
    const rotated = await rotateCredential(service, {
      previousCredentialId: created.id,
      kind: "model",
      provider: "openai",
      keyId,
      metadata: {},
      plaintext: secondSecret,
      actorUserId: "admin",
    });
    expect(rotated.id).not.toBe(created.id);
    await expect(vault.store.isLive(created.id)).resolves.toBe(false);
    await expect(vault.store.isLive(rotated.id)).resolves.toBe(true);
    await expect(
      vault.store.findLiveByKey({
        kind: "model",
        provider: "openai",
        keyId,
      }),
    ).resolves.toEqual({ id: rotated.id });
    await expect(
      decryptCredentialForUse(encryptionKey, vault, created.id),
    ).rejects.toThrow("Credential is revoked");
    await expect(
      decryptCredentialForUse(encryptionKey, vault, rotated.id),
    ).resolves.toBe(secondSecret);
    await expect(
      resolveModelApiKey({
        encryptionKey,
        reader: vault,
        provider: "openai",
        keyId,
        environment: {},
      }),
    ).resolves.toBe(secondSecret);

    // 4. Revoke the replacement: nothing live remains and the secret is gone.
    await revokeCredential(service, rotated.id, "admin");
    await expect(vault.store.isLive(rotated.id)).resolves.toBe(false);
    await expect(
      decryptCredentialForUse(encryptionKey, vault, rotated.id),
    ).rejects.toThrow("Credential is revoked");
    await expect(
      resolveModelApiKey({
        encryptionKey,
        reader: vault,
        provider: "openai",
        keyId,
        environment: {},
      }),
    ).resolves.toBeNull();

    // The trail records each transition and never the secrets themselves.
    expect(audited.map((event) => event.eventType)).toEqual([
      "credential.created",
      "credential.rotated",
      "credential.revoked",
    ]);
    expect(JSON.stringify(audited)).not.toContain(firstSecret);
    expect(JSON.stringify(audited)).not.toContain(secondSecret);
  });
});
