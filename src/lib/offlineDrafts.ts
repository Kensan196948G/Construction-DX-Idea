import type { IdeaStage, StructuredIdea } from "./shared";

/**
 * Offline draft queue logic (pure functions, unit-testable).
 *
 * Every queued draft carries an Idempotency-Key so retries after a partial
 * success can never create duplicate ideas. Keys are generated once at queue
 * time and reused across every sync attempt until the item is confirmed.
 */

export type OfflineDraft = {
  structured: StructuredIdea;
  stage: IdeaStage;
  queuedAt: string;
  idempotencyKey: string;
};

export const OFFLINE_DRAFT_LIMIT = 20;

export function createIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeQueue(raw: unknown): OfflineDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): OfflineDraft[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<OfflineDraft>;
    if (!candidate.structured || (candidate.stage !== "draft" && candidate.stage !== "submitted")) {
      return [];
    }
    return [
      {
        structured: candidate.structured,
        stage: candidate.stage,
        queuedAt: typeof candidate.queuedAt === "string" ? candidate.queuedAt : new Date(0).toISOString(),
        idempotencyKey:
          typeof candidate.idempotencyKey === "string" && candidate.idempotencyKey
            ? candidate.idempotencyKey
            : createIdempotencyKey(),
      },
    ];
  });
}

export function enqueueDraft(
  queue: OfflineDraft[],
  structured: StructuredIdea,
  stage: IdeaStage,
  now: Date = new Date(),
): OfflineDraft[] {
  const next: OfflineDraft = {
    structured,
    stage,
    queuedAt: now.toISOString(),
    idempotencyKey: createIdempotencyKey(),
  };
  // Keep the newest OFFLINE_DRAFT_LIMIT items; oldest items are dropped
  // (the regular error toast already informed the user their save failed).
  return [...queue, next].slice(-OFFLINE_DRAFT_LIMIT);
}

export async function drainQueue(
  queue: OfflineDraft[],
  save: (draft: OfflineDraft) => Promise<void>,
): Promise<{ remaining: OfflineDraft[]; synced: number; failed: number }> {
  const remaining: OfflineDraft[] = [];
  let synced = 0;
  let failed = 0;
  for (const draft of queue) {
    try {
      await save(draft);
      synced += 1;
    } catch {
      remaining.push(draft);
      failed += 1;
    }
  }
  return { remaining, synced, failed };
}
