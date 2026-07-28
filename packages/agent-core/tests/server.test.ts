/**
 * Server-only mintFeedbackToken helper + server export isolation.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { mintFeedbackToken } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("mintFeedbackToken", () => {
  it("POSTs /v1/sdk/tokens with secret Bearer and returns tokens", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.uservane.com/v1/sdk/tokens");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer uv_sk_test_secret");
      expect(headers["content-type"]).toBe("application/json");
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body.respondentId).toBe("u1");
      expect(body.sessionId).toBe("sess_1");
      expect(body.surveyId).toBe("surv_1");
      expect(body.taskType).toBe("refund");
      return new Response(
        JSON.stringify({
          tokens: { surv_1: "tok_bound" },
          suppression: [],
          issuedAt: "2026-07-27T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const result = await mintFeedbackToken({
      secretKey: "uv_sk_test_secret",
      respondentId: "u1",
      sessionId: "sess_1",
      surveyId: "surv_1",
      taskType: "refund",
      fetchImpl,
    });

    expect(result.tokens).toEqual({ surv_1: "tok_bound" });
    expect(result.suppression).toEqual([]);
    expect(result.issuedAt).toBe("2026-07-27T00:00:00.000Z");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws with status on 401 (public key / bad secret)", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "Invalid secret key" } }), {
        status: 401,
      });
    }) as unknown as typeof fetch;

    await expect(
      mintFeedbackToken({
        secretKey: "uv_pk_not_secret",
        respondentId: "u1",
        sessionId: "sess_1",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ message: "Invalid secret key", status: 401 });
  });

  it("rejects missing secretKey before network", async () => {
    await expect(
      mintFeedbackToken({
        secretKey: "",
        respondentId: "u1",
        sessionId: "sess_1",
      }),
    ).rejects.toThrow(/secretKey/);
  });

  it("rejects missing sessionId before network", async () => {
    await expect(
      mintFeedbackToken({
        secretKey: "uv_sk_x",
        respondentId: "u1",
        sessionId: "",
      }),
    ).rejects.toThrow(/sessionId/);
  });

  it("uses custom apiBase", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://staging.example/v1/sdk/tokens");
      return new Response(
        JSON.stringify({ tokens: {}, suppression: ["s1"], issuedAt: "2026-07-27T01:00:00.000Z" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await mintFeedbackToken({
      apiBase: "https://staging.example/",
      secretKey: "uv_sk_x",
      respondentId: "u1",
      sessionId: "sess_1",
      fetchImpl,
    });
    expect(result.tokens).toEqual({});
    expect(result.suppression).toEqual(["s1"]);
  });

  it("threads optional observationId + traceId into the mint body", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body.sessionId).toBe("sess_1");
      expect(body.observationId).toBe("obs_1");
      expect(body.traceId).toBe("trace_1");
      return new Response(
        JSON.stringify({
          tokens: { surv_1: "tok_obs" },
          suppression: [],
          issuedAt: "2026-07-27T00:00:00.000Z",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await mintFeedbackToken({
      secretKey: "uv_sk_test_secret",
      respondentId: "u1",
      sessionId: "sess_1",
      observationId: "obs_1",
      traceId: "trace_1",
      surveyId: "surv_1",
      fetchImpl,
    });
    expect(result.tokens).toEqual({ surv_1: "tok_obs" });
  });
});

describe("server export isolation", () => {
  it("src/server.ts does not import react or dom", () => {
    const src = readFileSync(join(__dirname, "../src/server.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/from\s+["']react-dom["']/);
    expect(src).not.toMatch(/from\s+["']react\/jsx/);
    expect(src).not.toMatch(/document\.|window\.|localStorage/);
    expect(src).not.toMatch(/["']use client["']/);
  });

  it("built dist/server.js (when present) has no react/dom import", () => {
    let built: string;
    try {
      built = readFileSync(join(__dirname, "../dist/server.js"), "utf8");
    } catch {
      // Build not run yet; source isolation is the hard gate above.
      return;
    }
    expect(built).not.toMatch(/from\s*["']react["']/);
    expect(built).not.toMatch(/react-dom/);
    expect(built).not.toMatch(/["']use client["']/);
  });
});
