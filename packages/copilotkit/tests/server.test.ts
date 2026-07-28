/**
 * Server mint contract: sessionId = threadId (CopilotKit correlation key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mintFeedbackToken } from "../src/server.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mintFeedbackToken sessionId=threadId", () => {
  it("POSTs /v1/sdk/tokens with sessionId equal to the CopilotKit threadId", async () => {
    const threadId = "ck_thread_xyz";
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("/v1/sdk/tokens");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer uv_sk_test_secret");
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body.sessionId).toBe(threadId);
      expect(body.respondentId).toBe("user_1");
      expect(body.surveyId).toBe("surv_post_task");
      return new Response(
        JSON.stringify({
          tokens: { surv_post_task: "tok_bound_ck" },
          suppression: [],
          issuedAt: "2026-07-27T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await mintFeedbackToken({
      secretKey: "uv_sk_test_secret",
      respondentId: "user_1",
      sessionId: threadId,
      surveyId: "surv_post_task",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.tokens.surv_post_task).toBe("tok_bound_ck");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("requires sessionId (absent threadId must not mint silently as empty string)", async () => {
    await expect(
      mintFeedbackToken({
        secretKey: "uv_sk_test",
        respondentId: "user_1",
        sessionId: "",
        surveyId: "surv_1",
      }),
    ).rejects.toThrow(/sessionId/i);
  });
});
