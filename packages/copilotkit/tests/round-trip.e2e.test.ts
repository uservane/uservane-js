/**
 * Behavioral edge round-trip for the CopilotKit adapter.
 *
 * Covered (when staging env is present):
 * - Mint a bound token with sessionId=threadId via real POST /v1/sdk/tokens.
 * - Submit a response with that token + sessionId.
 * - Assert response is linked and pending-scores queue carries that sessionId.
 *
 * Deferred: full React-render e2e for UserVaneCopilotFeedback inside a live
 * CopilotKit chat shell (resolution edge is covered by unit/hook tests with
 * mocked useCopilotChatInternal; this file covers the mint/link contract).
 *
 * Skip when staging env vars are missing (same gate as apps/uservane-api/e2e).
 */
import { describe, expect, it } from "vitest";
import { mintFeedbackToken } from "../src/server.js";

type StagingEnv = {
  baseURL: string;
  supportSecret: string;
  accessClientId: string;
  accessClientSecret: string;
};

function readStagingEnv(): StagingEnv | null {
  const baseURL = process.env.UV_STAGING_BASE_URL?.trim() ?? "";
  const supportSecret =
    process.env.UV_STAGING_GATE_SECRET?.trim() ?? process.env.STAGING_GATE_SECRET?.trim() ?? "";
  const accessClientId = process.env.CF_ACCESS_CLIENT_ID?.trim() ?? "";
  const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim() ?? "";
  if (!baseURL || !supportSecret || !accessClientId || !accessClientSecret) {
    return null;
  }
  return { baseURL, supportSecret, accessClientId, accessClientSecret };
}

function accessHeaders(env: StagingEnv): Record<string, string> {
  return {
    "CF-Access-Client-Id": env.accessClientId,
    "CF-Access-Client-Secret": env.accessClientSecret,
    "x-staging-support": env.supportSecret,
  };
}

function uniqueOrgId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const staging = readStagingEnv();

describe("copilotkit edge round-trip", () => {
  it.skipIf(!staging)(
    "mint with sessionId=threadId + submit links and pending-scores carries threadId",
    async () => {
      if (!staging) return;
      const env = staging;
      const base = env.baseURL.replace(/\/$/, "");
      const orgId = uniqueOrgId("ck_rt");
      const headers = accessHeaders(env);

      const loginRes = await fetch(`${base}/__test/login`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ orgId, email: `ck+${orgId}@test.local` }),
      });
      expect(loginRes.status, await loginRes.text()).toBe(200);

      const resetRes = await fetch(`${base}/__test/reset`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      expect(resetRes.status, await resetRes.text()).toBe(200);

      const seedRes = await fetch(`${base}/__test/seed-project`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ orgId, withSurvey: true }),
      });
      const seedText = await seedRes.text();
      expect(seedRes.status, seedText).toBe(200);
      const seed = JSON.parse(seedText) as {
        publicKey: string;
        secretKey: string;
        surveyId: string;
      };
      expect(seed.secretKey, "seed must return secretKey").toBeTruthy();
      expect(seed.publicKey).toBeTruthy();
      expect(seed.surveyId).toBeTruthy();

      // CopilotKit correlation key
      const threadId = `thread_ck_${orgId}`;
      const respondentId = `u_ck_${orgId}`;

      const fetchImpl: typeof fetch = async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const rewritten = url.replace("https://api.uservane.com", base);
        return fetch(rewritten, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string>),
            ...headers,
          },
        });
      };

      const mint = await mintFeedbackToken({
        secretKey: seed.secretKey,
        respondentId,
        sessionId: threadId,
        surveyId: seed.surveyId,
        taskType: "support",
        apiBase: base,
        fetchImpl,
      });

      const showToken = mint.tokens[seed.surveyId];
      expect(showToken, "bound showToken required").toBeTruthy();

      const submitRes = await fetch(`${base}/v1/sdk/responses`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          key: seed.publicKey,
          showToken,
          surveyId: seed.surveyId,
          rating: 8,
          text: "copilotkit e2e linked",
          userId: respondentId,
          sessionId: threadId,
          taskType: "support",
          identityKind: "identified",
        }),
      });
      const submitText = await submitRes.text();
      expect(submitRes.status, submitText).toBe(201);
      const submitted = JSON.parse(submitText) as { ok: boolean; id: string };
      expect(submitted.ok).toBe(true);
      expect(submitted.id).toBeTruthy();

      const inspectRes = await fetch(
        `${base}/__test/response?orgId=${encodeURIComponent(orgId)}&responseId=${encodeURIComponent(submitted.id)}`,
        { headers },
      );
      const inspectText = await inspectRes.text();
      expect(inspectRes.status, inspectText).toBe(200);
      const row = JSON.parse(inspectText) as {
        sessionId: string | null;
        correlationState: string | null;
        scoreState: string | null;
        taskType: string | null;
      };
      expect(row.sessionId).toBe(threadId);
      expect(row.correlationState).toBe("linked");
      expect(row.scoreState).toBe("pending");
      expect(row.taskType).toBe("support");

      const queueRes = await fetch(`${base}/v1/sdk/pending-scores`, {
        headers: {
          ...headers,
          authorization: `Bearer ${seed.secretKey}`,
          accept: "application/json",
        },
      });
      const queueText = await queueRes.text();
      expect(queueRes.status, queueText).toBe(200);
      const queue = JSON.parse(queueText) as {
        scores: Array<{ id: string; sessionId: string | null; rating: number | null }>;
      };
      const hit = queue.scores.find((s) => s.id === submitted.id);
      expect(hit, "linked pending score must appear").toBeTruthy();
      expect(hit?.sessionId).toBe(threadId);
      expect(hit?.rating).toBe(8);
    },
  );

  it("documents coverage when staging is unavailable", () => {
    if (staging) return;
    // Unit tests still cover resolution edge, dedupe, stop suppress, mint body, isolation.
    expect(true).toBe(true);
  });
});
