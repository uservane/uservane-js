/**
 * pushPendingScores: poll -> Langfuse session score -> ack.
 * Langfuse SDK is mocked (createLangfuse inject). No DOM / no secrets in client.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { type LangfuseScoreClient, pushPendingScores } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeScore(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "resp_1",
    sessionId: "sess_lf_1",
    observationId: null,
    traceId: null,
    rating: 9,
    text: "helpful refund",
    taskType: "refund",
    surveyId: "surv_1",
    at: "2026-07-27T12:00:00.000Z",
    ...overrides,
  };
}

describe("pushPendingScores", () => {
  it("polls queue, creates session-level score with namespaced name, acks delivered", async () => {
    const scoreCalls: unknown[] = [];
    const flush = vi.fn((cb: (err?: unknown) => void) => cb());
    const lf: LangfuseScoreClient = {
      score(body) {
        scoreCalls.push(body);
        return lf;
      },
      flush,
    };

    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/v1/sdk/pending-scores") && !u.includes("/ack")) {
        expect(init?.method ?? "GET").toMatch(/GET/i);
        const headers = init?.headers as Record<string, string>;
        expect(headers.authorization).toBe("Bearer uv_sk_customer_secret");
        return new Response(JSON.stringify({ scores: [makeScore()] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("/pending-scores/ack")) {
        expect(init?.method).toBe("POST");
        const headers = init?.headers as Record<string, string>;
        expect(headers.authorization).toBe("Bearer uv_sk_customer_secret");
        const body = JSON.parse(String(init?.body)) as {
          results: Array<{ id: string; state: string }>;
        };
        expect(body.results).toEqual([{ id: "resp_1", state: "delivered" }]);
        return new Response(JSON.stringify({ ok: true, updated: 1 }), { status: 200 });
      }
      throw new Error(`unexpected url ${u}`);
    }) as unknown as typeof fetch;

    const result = await pushPendingScores({
      uservane: { secretKey: "uv_sk_customer_secret", apiBase: "https://api.example.com" },
      langfuse: {
        publicKey: "pk-lf-test",
        secretKey: "sk-lf-test",
        baseUrl: "https://cloud.langfuse.com",
      },
      fetchImpl,
      createLangfuse: (cfg) => {
        expect(cfg.publicKey).toBe("pk-lf-test");
        expect(cfg.secretKey).toBe("sk-lf-test");
        expect(cfg.baseUrl).toBe("https://cloud.langfuse.com");
        return lf;
      },
    });

    expect(result).toEqual({ delivered: 1, failed: 0 });
    expect(scoreCalls).toHaveLength(1);
    expect(scoreCalls[0]).toEqual({
      id: "uv-resp_1", // idempotency key -> Langfuse upserts, no duplicate on re-push
      name: "uservane.satisfaction",
      value: 9,
      comment: "helpful refund",
      sessionId: "sess_lf_1",
    });
    expect(flush).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("acks FAILED (never delivered) when Langfuse ingestion fails at flush", async () => {
    // The REAL failure mode: score() just enqueues (never throws for a delivery
    // problem); the ingestion HTTP failure surfaces as flush(cb)'s err. The old
    // flushAsync() would have swallowed this and (wrongly) acked delivered. Model the
    // real behavior: flush yields an error -> the row MUST be acked failed, not lost.
    const lf: LangfuseScoreClient = {
      score() {
        return lf;
      },
      flush: (cb) => cb(new Error("langfuse ingestion failed: 401 invalid credentials")),
    };

    const ackBodies: unknown[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/pending-scores") && !u.includes("/ack")) {
        return new Response(JSON.stringify({ scores: [makeScore({ id: "resp_fail" })] }), {
          status: 200,
        });
      }
      if (u.includes("/ack")) {
        ackBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ok: true, updated: 1 }), { status: 200 });
      }
      throw new Error(`unexpected ${u}`);
    }) as unknown as typeof fetch;

    const result = await pushPendingScores({
      uservane: { secretKey: "uv_sk_x" },
      langfuse: { publicKey: "pk", secretKey: "sk" },
      fetchImpl,
      createLangfuse: () => lf,
    });

    expect(result).toEqual({ delivered: 0, failed: 1 });
    expect(ackBodies).toEqual([{ results: [{ id: "resp_fail", state: "failed" }] }]);
  });

  it("returns zeros when queue is empty (no Langfuse / no ack)", async () => {
    const createLangfuse = vi.fn();
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ scores: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await pushPendingScores({
      uservane: { secretKey: "uv_sk_x" },
      langfuse: { publicKey: "pk", secretKey: "sk" },
      fetchImpl,
      createLangfuse,
    });
    expect(result).toEqual({ delivered: 0, failed: 0 });
    expect(createLangfuse).not.toHaveBeenCalled();
  });

  it("uses custom scoreName when provided", async () => {
    const scoreCalls: unknown[] = [];
    const lf: LangfuseScoreClient = {
      score(body) {
        scoreCalls.push(body);
        return lf;
      },
      flush: (cb) => cb(),
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/ack")) {
        return new Response(JSON.stringify({ ok: true, updated: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ scores: [makeScore()] }), { status: 200 });
    }) as unknown as typeof fetch;

    await pushPendingScores({
      uservane: { secretKey: "uv_sk_x" },
      langfuse: { publicKey: "pk", secretKey: "sk" },
      scoreName: "uservane.nps_raw",
      fetchImpl,
      createLangfuse: () => lf,
    });
    expect((scoreCalls[0] as { name: string }).name).toBe("uservane.nps_raw");
  });

  it("rejects missing uservane.secretKey before network", async () => {
    await expect(
      pushPendingScores({
        uservane: { secretKey: "" },
        langfuse: { publicKey: "pk", secretKey: "sk" },
      }),
    ).rejects.toThrow(/secretKey/);
  });

  it("passes includeFailed to the queue query", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ scores: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await pushPendingScores({
      uservane: { secretKey: "uv_sk_x", apiBase: "https://api.example.com" },
      langfuse: { publicKey: "pk", secretKey: "sk" },
      includeFailed: true,
      fetchImpl,
    });
    expect(urls[0]).toContain("includeFailed=true");
  });

  it("row with traceId+observationId -> OBSERVATION-level score (not session-only)", async () => {
    const scoreCalls: unknown[] = [];
    const flush = vi.fn((cb: (err?: unknown) => void) => cb());
    const lf: LangfuseScoreClient = {
      score(body) {
        scoreCalls.push(body);
        return lf;
      },
      flush,
    };

    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/pending-scores") && !u.includes("/ack")) {
        return new Response(
          JSON.stringify({
            scores: [
              makeScore({
                id: "resp_obs",
                sessionId: "sess_also_present",
                observationId: "obs_lf_1",
                traceId: "trace_lf_1",
                rating: 7,
                text: "step thumb",
              }),
            ],
          }),
          { status: 200 },
        );
      }
      if (u.includes("/ack")) {
        const body = JSON.parse(String(init?.body)) as {
          results: Array<{ id: string; state: string }>;
        };
        expect(body.results).toEqual([{ id: "resp_obs", state: "delivered" }]);
        return new Response(JSON.stringify({ ok: true, updated: 1 }), { status: 200 });
      }
      throw new Error(`unexpected ${u}`);
    }) as unknown as typeof fetch;

    const result = await pushPendingScores({
      uservane: { secretKey: "uv_sk_x" },
      langfuse: { publicKey: "pk", secretKey: "sk" },
      fetchImpl,
      createLangfuse: () => lf,
    });

    expect(result).toEqual({ delivered: 1, failed: 0 });
    expect(scoreCalls).toHaveLength(1);
    expect(scoreCalls[0]).toEqual({
      id: "uv-resp_obs",
      name: "uservane.satisfaction",
      value: 7,
      comment: "step thumb",
      traceId: "trace_lf_1",
      observationId: "obs_lf_1",
    });
    // Must NOT be a sessionId-only score when both observation ids are present.
    expect(scoreCalls[0] as { sessionId?: string }).not.toHaveProperty("sessionId");
    expect(flush).toHaveBeenCalled();
  });

  it("traceId without observationId (or reverse) is fail-not-orphan, no observation score", async () => {
    const scoreCalls: unknown[] = [];
    const lf: LangfuseScoreClient = {
      score(body) {
        scoreCalls.push(body);
        return lf;
      },
      flush: (cb) => cb(),
    };

    const ackBodies: unknown[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/pending-scores") && !u.includes("/ack")) {
        return new Response(
          JSON.stringify({
            scores: [
              makeScore({
                id: "resp_half_trace",
                sessionId: null,
                observationId: null,
                traceId: "trace_only",
              }),
              makeScore({
                id: "resp_half_obs",
                sessionId: null,
                observationId: "obs_only",
                traceId: null,
              }),
            ],
          }),
          { status: 200 },
        );
      }
      if (u.includes("/ack")) {
        ackBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ok: true, updated: 2 }), { status: 200 });
      }
      throw new Error(`unexpected ${u}`);
    }) as unknown as typeof fetch;

    const result = await pushPendingScores({
      uservane: { secretKey: "uv_sk_x" },
      langfuse: { publicKey: "pk", secretKey: "sk" },
      fetchImpl,
      createLangfuse: () => lf,
    });

    expect(result).toEqual({ delivered: 0, failed: 2 });
    // Never create an orphan/half-id observation score.
    expect(scoreCalls).toHaveLength(0);
    expect(ackBodies).toEqual([
      {
        results: [
          { id: "resp_half_trace", state: "failed" },
          { id: "resp_half_obs", state: "failed" },
        ],
      },
    ]);
  });

  it("session-only row still pushes session score (unchanged)", async () => {
    const scoreCalls: unknown[] = [];
    const lf: LangfuseScoreClient = {
      score(body) {
        scoreCalls.push(body);
        return lf;
      },
      flush: (cb) => cb(),
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/ack")) {
        return new Response(JSON.stringify({ ok: true, updated: 1 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          scores: [makeScore({ observationId: null, traceId: null })],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await pushPendingScores({
      uservane: { secretKey: "uv_sk_x" },
      langfuse: { publicKey: "pk", secretKey: "sk" },
      fetchImpl,
      createLangfuse: () => lf,
    });
    expect(scoreCalls[0]).toEqual({
      id: "uv-resp_1",
      name: "uservane.satisfaction",
      value: 9,
      comment: "helpful refund",
      sessionId: "sess_lf_1",
    });
  });
});

describe("server-only / no client secrets", () => {
  it("source has no DOM / window / document references", () => {
    const src = readFileSync(join(__dirname, "../src/index.ts"), "utf8");
    expect(src).not.toMatch(/\bwindow\b/);
    expect(src).not.toMatch(/\bdocument\b/);
    expect(src).not.toMatch(/\blocalStorage\b/);
    expect(src).not.toMatch(/"use client"/);
  });

  it("tsup builds for node platform only", () => {
    const cfg = readFileSync(join(__dirname, "../tsup.config.ts"), "utf8");
    expect(cfg).toMatch(/platform:\s*["']node["']/);
    expect(cfg).not.toMatch(/platform:\s*["']browser["']/);
  });

  it("package has no React dependency", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.react).toBeUndefined();
    expect(pkg.peerDependencies?.react).toBeUndefined();
  });
});
