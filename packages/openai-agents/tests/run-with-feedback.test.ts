/**
 * Fire-once run wrapper: resolves feedback exactly once on run resolution,
 * dedupes across handoff-style multi-agent_end scenarios, maps groupId -> sessionId.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __getMintAttemptCountForTests,
  __resetMintAttemptCountForTests,
  type AgentsRunResultLike,
  awaitRunResolution,
  mintFeedbackForRun,
  runWithFeedback,
} from "../src/server.js";

// Mock the real SDK so the free-run path (no runFn/runner) can be exercised without
// calling OpenAI. Captures Runner construction to prove groupId is set on the Runner
// (RunConfig), which is the ONLY place the SDK reads it - not per-call run() options.
const agentsMock = vi.hoisted(() => {
  const runnerRun = vi.fn(async () => ({ finalOutput: "runner-out" }));
  const RunnerCtor = vi.fn().mockImplementation((cfg?: Record<string, unknown>) => ({
    __cfg: cfg,
    run: runnerRun,
  }));
  const freeRun = vi.fn(async () => ({ finalOutput: "free-out" }));
  return { runnerRun, RunnerCtor, freeRun };
});
vi.mock("@openai/agents", () => ({
  run: agentsMock.freeRun,
  Runner: agentsMock.RunnerCtor,
}));

beforeEach(() => {
  __resetMintAttemptCountForTests();
  agentsMock.runnerRun.mockClear();
  agentsMock.RunnerCtor.mockClear();
  agentsMock.freeRun.mockClear();
});

function makeFetchForMint(token = "tok_bound_1") {
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toContain("/v1/sdk/tokens");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer uv_sk_test");
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    return new Response(
      JSON.stringify({
        tokens: { [body.surveyId ?? "surv_1"]: token },
        suppression: [],
        issuedAt: "2026-07-27T00:00:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  return fetchImpl;
}

describe("awaitRunResolution", () => {
  it("returns non-stream results immediately", async () => {
    const result: AgentsRunResultLike = { finalOutput: "done" };
    const out = await awaitRunResolution(result);
    expect(out.finalOutput).toBe("done");
  });

  it("awaits stream completed before returning", async () => {
    let resolved = false;
    const result: AgentsRunResultLike = {
      finalOutput: "streamed",
      completed: new Promise<void>((r) => {
        setTimeout(() => {
          resolved = true;
          r();
        }, 10);
      }),
    };
    const out = await awaitRunResolution(result);
    expect(resolved).toBe(true);
    expect(out.finalOutput).toBe("streamed");
  });
});

describe("mintFeedbackForRun", () => {
  it("mints with sessionId = groupId exactly once per result (dedupe)", async () => {
    const fetchImpl = makeFetchForMint("tok_once");
    const result: AgentsRunResultLike = { finalOutput: "ok" };

    const first = await mintFeedbackForRun(result, {
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      groupId: "grp_session_1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = await mintFeedbackForRun(result, {
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      groupId: "grp_session_1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(first.showToken).toBe("tok_once");
    expect(first.sessionId).toBe("grp_session_1");
    expect(first.unbound).toBeUndefined();
    expect(second).toBe(first);
    expect(__getMintAttemptCountForTests()).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const callInit = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(callInit?.body)) as Record<string, string>;
    expect(body.sessionId).toBe("grp_session_1");
    expect(body.respondentId).toBe("u1");
    expect(body.surveyId).toBe("surv_1");
  });

  it("absent groupId -> unbound + flagged, no network", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result: AgentsRunResultLike = { finalOutput: "ok" };

    const payload = await mintFeedbackForRun(result, {
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      fetchImpl,
    });

    expect(payload.unbound).toBe(true);
    expect(payload.showToken).toBeUndefined();
    expect(payload.sessionId).toBeUndefined();
    expect(payload.reason).toMatch(/groupId absent/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(__getMintAttemptCountForTests()).toBe(0);
  });

  it("handoff chain: multiple agent_end-style results do not double-mint the same result", async () => {
    // Simulate the anti-pattern: agent_end fires 3 times for the same run result.
    const fetchImpl = makeFetchForMint();
    const sharedResult: AgentsRunResultLike = { finalOutput: "handoff-done" };

    await mintFeedbackForRun(sharedResult, {
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      groupId: "grp_h",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    // "agent_end" for agent A, B, C all try to mint against the same resolution object:
    for (let i = 0; i < 3; i++) {
      await mintFeedbackForRun(sharedResult, {
        secretKey: "uv_sk_test",
        respondentId: "u1",
        surveyId: "surv_1",
        groupId: "grp_h",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
    }
    expect(__getMintAttemptCountForTests()).toBe(1);
  });
});

describe("runWithFeedback", () => {
  it("awaits run, mints once with sessionId=groupId, returns finalOutput + feedback", async () => {
    const fetchImpl = makeFetchForMint("tok_run");
    const runFn = vi.fn(async () => ({ finalOutput: "hello-agent" }));

    const out = await runWithFeedback({ name: "agent" }, "hi", {
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      groupId: "grp_run",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      runFn,
    });

    expect(out.finalOutput).toBe("hello-agent");
    expect(out.feedback.showToken).toBe("tok_run");
    expect(out.feedback.sessionId).toBe("grp_run");
    expect(runFn).toHaveBeenCalledTimes(1);
    const runCall = runFn.mock.calls[0] as unknown as [unknown, unknown, Record<string, unknown>?];
    const runOpts = runCall[2] ?? {};
    // groupId must NOT be forwarded onto per-call run() options - the SDK ignores it
    // there (SharedRunOptions has no groupId). Correlation still works: the mint uses
    // options.groupId directly (asserted via feedback.sessionId above).
    expect(runOpts.groupId).toBeUndefined();
    expect(__getMintAttemptCountForTests()).toBe(1);
  });

  it("free-run path (no runFn/runner): builds Runner({ groupId }) so the trace carries it", async () => {
    const fetchImpl = makeFetchForMint("tok_free");

    const out = await runWithFeedback({ name: "agent" }, "hi", {
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      groupId: "grp_free",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      // no runFn, no runner -> real @openai/agents path (mocked)
    });

    // groupId present -> constructs a Runner carrying it (RunConfig), NOT the free run().
    expect(agentsMock.RunnerCtor).toHaveBeenCalledWith({ groupId: "grp_free" });
    expect(agentsMock.runnerRun).toHaveBeenCalledTimes(1);
    expect(agentsMock.freeRun).not.toHaveBeenCalled();
    expect(out.finalOutput).toBe("runner-out");
    expect(out.feedback.sessionId).toBe("grp_free");
    expect(__getMintAttemptCountForTests()).toBe(1);
  });

  it("free-run path without groupId uses the bare run() (no Runner, unbound feedback)", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const out = await runWithFeedback({ name: "agent" }, "hi", {
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      fetchImpl,
      // no groupId, no runFn, no runner
    });

    expect(agentsMock.RunnerCtor).not.toHaveBeenCalled();
    expect(agentsMock.freeRun).toHaveBeenCalledTimes(1);
    expect(out.feedback.unbound).toBe(true);
    expect(__getMintAttemptCountForTests()).toBe(0);
  });

  it("stream path: awaits result.completed then mints once", async () => {
    const fetchImpl = makeFetchForMint("tok_stream");
    let completed = false;
    const runFn = vi.fn(async () => ({
      finalOutput: "stream-out",
      completed: new Promise<void>((r) => {
        setTimeout(() => {
          completed = true;
          r();
        }, 5);
      }),
    }));

    const out = await runWithFeedback({ name: "agent" }, "hi", {
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      groupId: "grp_s",
      stream: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      runFn,
    });

    expect(completed).toBe(true);
    expect(out.finalOutput).toBe("stream-out");
    expect(out.feedback.sessionId).toBe("grp_s");
    expect(out.feedback.showToken).toBe("tok_stream");
  });

  it("absent groupId flags unbound without mint", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const runFn = vi.fn(async () => ({ finalOutput: "x" }));

    const out = await runWithFeedback({ name: "a" }, "i", {
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      fetchImpl,
      runFn,
    });

    expect(out.feedback.unbound).toBe(true);
    expect(out.feedback.reason).toMatch(/groupId absent/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
