import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OFFLINE_DRAFT_LIMIT,
  drainQueue,
  enqueueDraft,
  normalizeQueue,
  type OfflineDraft,
} from "../src/lib/offlineDrafts";
import { structuredIdeaSchema } from "../src/lib/shared";

const structured = structuredIdeaSchema.parse({
  title: "オフライン下書き",
  currentIssue: "通信が途絶えた状況で保存するケース",
  targetBusiness: "テスト",
  targetUsers: "",
  currentWorkflow: "手順",
  improvementIdea: "改善",
  expectedEffects: "",
  requiredData: [],
  relatedSystems: [],
  implementationOptions: [],
  securityNotes: [],
  openQuestions: [],
  mvpCandidate: "",
  mvpDoneDefinition: "",
});

describe("offline draft queue", () => {
  it("keeps at most the configured number of newest drafts", () => {
    let queue: OfflineDraft[] = [];
    for (let index = 0; index < OFFLINE_DRAFT_LIMIT + 3; index += 1) {
      queue = enqueueDraft(queue, structured, "submitted");
    }
    assert.equal(queue.length, OFFLINE_DRAFT_LIMIT);
    assert.ok(new Set(queue.map((item) => item.idempotencyKey)).size === queue.length);
  });

  it("normalizes legacy items by generating a stable idempotency key", () => {
    const queue = normalizeQueue([
      { structured, stage: "draft", queuedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    assert.equal(queue.length, 1);
    assert.match(queue[0].idempotencyKey, /^[0-9a-f-]{36}$|^offline-/);
  });

  it("drops malformed queue entries", () => {
    assert.deepEqual(normalizeQueue([{ stage: "draft" }, null, "garbage"]), []);
  });

  it("removes an item only after a successful save and reuses its key on retry", async () => {
    const queue = normalizeQueue([
      { structured, stage: "submitted", queuedAt: "2026-08-01T00:00:00.000Z", idempotencyKey: "retry-key-1234" },
    ]);
    const seenKeys: string[] = [];
    const first = await drainQueue(queue, async (draft) => {
      seenKeys.push(draft.idempotencyKey);
      throw new Error("offline");
    });
    assert.equal(first.synced, 0);
    assert.equal(first.failed, 1);
    assert.equal(first.remaining.length, 1);

    const second = await drainQueue(first.remaining, async (draft) => {
      seenKeys.push(draft.idempotencyKey);
    });
    assert.equal(second.synced, 1);
    assert.equal(second.remaining.length, 0);
    assert.deepEqual(seenKeys, ["retry-key-1234", "retry-key-1234"]);
  });
});
