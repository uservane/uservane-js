/**
 * Integration test against the REAL langfuse SDK over a real HTTP server.
 *
 * The rest of this suite injects a fake Langfuse whose `flush(cb)` calls back
 * immediately. That fake models the contract we *wanted*, so twelve green tests
 * still missed a live defect: against the real SDK, `flush(cb)` called straight
 * after `score()` returns in about 1ms with no error having sent nothing at all,
 * because `score()` enqueues through an async processing step. Every score was
 * being acked `delivered` without reaching Langfuse.
 *
 * These tests use the real client so that cannot regress unnoticed.
 */
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { pushPendingScores } from "../src/index.js";

type IngestionMode = "ok" | "500" | "207-errors";

type Harness = {
  baseUrl: string;
  /** Ingestion requests that actually reached the server. */
  hits: () => number;
  close: () => Promise<void>;
};

async function startLangfuse(mode: IngestionMode): Promise<Harness> {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    // Drain the request so "end" fires; the body content is not asserted on.
    req.resume();
    req.on("end", () => {
      hits += 1;
      if (mode === "ok") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ successes: [{ id: "x", status: 201 }], errors: [] }));
        return;
      }
      if (mode === "207-errors") {
        // Langfuse ingestion answers 207 with per-event errors. A partially
        // rejected batch must not be reported as delivered.
        res.writeHead(207, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            successes: [],
            errors: [{ id: "x", status: 400, message: "rejected event" }],
          }),
        );
        return;
      }
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "boom" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    hits: () => hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** UserVane API stub: one pending score to push, and a recorded ack. */
function uservaneStub(): {
  fetchImpl: typeof fetch;
  acked: () => Array<{ id: string; state: string }>;
} {
  let acked: Array<{ id: string; state: string }> = [];
  // Derive the signature from `fetch` itself: this package's tsconfig has no
  // DOM lib, so RequestInfo/RequestInit are not in scope here.
  const fetchImpl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/v1/sdk/pending-scores/ack")) {
      const parsed = JSON.parse(String(init?.body ?? "{}")) as {
        results?: Array<{ id: string; state: string }>;
      };
      acked = parsed.results ?? [];
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        scores: [
          {
            id: "sc_1",
            sessionId: "sess_1",
            observationId: null,
            traceId: null,
            rating: 9,
            text: "useful",
            taskType: null,
            surveyId: "surv_1",
            at: "2026-08-21T00:00:00.000Z",
          },
        ],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, acked: () => acked };
}

let harness: Harness | null = null;
afterEach(async () => {
  await harness?.close();
  harness = null;
});

describe("pushPendingScores against the real langfuse SDK", () => {
  it("actually transmits the score and acks delivered on a clean 200", async () => {
    harness = await startLangfuse("ok");
    const uv = uservaneStub();

    const summary = await pushPendingScores({
      uservane: { secretKey: "uv_sk_test", apiBase: "https://api.uservane.test" },
      langfuse: { publicKey: "pk-lf-test", secretKey: "sk-lf-test", baseUrl: harness.baseUrl },
      fetchImpl: uv.fetchImpl,
    });

    // The regression this file exists for: a bare flush() reported delivered
    // with zero requests sent.
    expect(harness.hits(), "score must actually reach Langfuse").toBeGreaterThan(0);
    expect(summary).toEqual({ delivered: 1, failed: 0 });
    expect(uv.acked()).toEqual([{ id: "sc_1", state: "delivered" }]);
  }, 30_000);

  it("acks failed when ingestion returns 500", async () => {
    harness = await startLangfuse("500");
    const uv = uservaneStub();

    const summary = await pushPendingScores({
      uservane: { secretKey: "uv_sk_test", apiBase: "https://api.uservane.test" },
      langfuse: { publicKey: "pk-lf-test", secretKey: "sk-lf-test", baseUrl: harness.baseUrl },
      fetchImpl: uv.fetchImpl,
    });

    expect(summary).toEqual({ delivered: 0, failed: 1 });
    expect(uv.acked()).toEqual([{ id: "sc_1", state: "failed" }]);
  }, 30_000);

  it("acks failed when a 207 carries per-event errors", async () => {
    harness = await startLangfuse("207-errors");
    const uv = uservaneStub();

    const summary = await pushPendingScores({
      uservane: { secretKey: "uv_sk_test", apiBase: "https://api.uservane.test" },
      langfuse: { publicKey: "pk-lf-test", secretKey: "sk-lf-test", baseUrl: harness.baseUrl },
      fetchImpl: uv.fetchImpl,
    });

    expect(summary).toEqual({ delivered: 0, failed: 1 });
    expect(uv.acked()).toEqual([{ id: "sc_1", state: "failed" }]);
  }, 30_000);
});
