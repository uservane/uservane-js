/**
 * Behavioral edge round-trip for the OpenAI Agents adapter.
 *
 * Covered (when staging env is present):
 * - Simulate an @openai/agents run via injected runFn (no real OpenAI).
 * - Mint a bound token with sessionId=groupId via real POST /v1/sdk/tokens.
 * - Submit a response with that token + sessionId.
 * - Assert response is linked and pending-scores queue carries that sessionId.
 *
 * Deferred: full Playwright UI e2e for InlineFeedback in an Agents chat shell
 * (server SDK path; client UI is shared with vercel-ai and covered there).
 *
 * Skip when staging env vars are missing (same gate as apps/uservane-api/e2e).
 */
import { describe, expect, it } from "vitest";
import { runWithFeedback } from "../src/server.js";

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

describe("openai-agents edge round-trip", () => {
  it.skipIf(!staging)(
    "runWithFeedback mint + submit links and pending-scores carries groupId as sessionId",
    async () => {
      if (!staging) return;
      const env = staging;
      const base = env.baseURL.replace(/\/$/, "");
      const orgId = uniqueOrgId("oai_rt");
      const headers = accessHeaders(env);

      // Login + reset + seed (house /__test helpers)
      const loginRes = await fetch(`${base}/__test/login`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ orgId, email: `oai+${orgId}@test.local` }),
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

      const groupId = `sess_oai_${orgId}`;
      const respondentId = `u_oai_${orgId}`;

      // Adapter: mock Agents run (no real OpenAI), real mint via edge.
      const fetchImpl: typeof fetch = async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        // Rewrite default api host to staging.
        const rewritten = url.replace("https://api.uservane.com", base);
        return fetch(rewritten, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string>),
            ...headers,
          },
        });
      };

      const { finalOutput, feedback } = await runWithFeedback(
        { name: "mock-agent" },
        "simulate agents run",
        {
          secretKey: seed.secretKey,
          respondentId,
          surveyId: seed.surveyId,
          groupId,
          taskType: "refund",
          apiBase: base,
          fetchImpl,
          runFn: async () => ({ finalOutput: "agents-mock-output" }),
        },
      );

      expect(finalOutput).toBe("agents-mock-output");
      expect(feedback.unbound).toBeUndefined();
      expect(feedback.sessionId).toBe(groupId);
      expect(feedback.showToken, "bound showToken required").toBeTruthy();

      // Submit with bound token + sessionId = groupId
      const submitRes = await fetch(`${base}/v1/sdk/responses`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          key: seed.publicKey,
          showToken: feedback.showToken,
          surveyId: seed.surveyId,
          rating: 9,
          text: "oai agents e2e linked",
          userId: respondentId,
          sessionId: groupId,
          taskType: "refund",
          identityKind: "identified",
        }),
      });
      const submitText = await submitRes.text();
      expect(submitRes.status, submitText).toBe(201);
      const submitted = JSON.parse(submitText) as { ok: boolean; id: string };
      expect(submitted.ok).toBe(true);
      expect(submitted.id).toBeTruthy();

      // Inspect linked markers (not only 200)
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
      expect(row.sessionId).toBe(groupId);
      expect(row.correlationState).toBe("linked");
      expect(row.scoreState).toBe("pending");
      expect(row.taskType).toBe("refund");

      // Pending session-score carries sessionId = groupId
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
      expect(hit?.sessionId).toBe(groupId);
      expect(hit?.rating).toBe(9);
    },
  );

  it("documents coverage when staging is unavailable", () => {
    if (staging) return;
    // Unit tests still cover fire-once, dedupe, groupId mapping, bridge flush.
    expect(true).toBe(true);
  });
});
