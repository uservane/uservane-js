/**
 * mintFeedbackToken allowModelRequested flag is forwarded to the edge.
 */
import { describe, expect, it, vi } from "vitest";
import { mintFeedbackToken } from "../src/server.js";

describe("mintFeedbackToken allowModelRequested", () => {
  it("forwards allowModelRequested:true in the POST body", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.allowModelRequested).toBe(true);
      expect(body.sessionId).toBe("sess_1");
      return new Response(
        JSON.stringify({
          tokens: { surv_1: "tok_amr" },
          suppression: [],
          issuedAt: "2026-07-27T00:00:00.000Z",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await mintFeedbackToken({
      secretKey: "uv_sk_x",
      respondentId: "u1",
      sessionId: "sess_1",
      surveyId: "surv_1",
      allowModelRequested: true,
      fetchImpl,
    });
    expect(result.tokens.surv_1).toBe("tok_amr");
  });

  it("omits allowModelRequested when false/absent", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.allowModelRequested).toBeUndefined();
      return new Response(
        JSON.stringify({ tokens: {}, suppression: [], issuedAt: "2026-07-27T00:00:00.000Z" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await mintFeedbackToken({
      secretKey: "uv_sk_x",
      respondentId: "u1",
      sessionId: "sess_1",
      fetchImpl,
    });
  });
});
