/**
 * deferAsk: resolveTask({defer:true}) suppresses in-session ask;
 * mintDeferredAskLink returns hosted token/URL; open-task bar on redemption.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAnonMemoryForTests } from "../src/anonymous-key.js";
import { AgentController } from "../src/controller.js";
import { mintDeferredAskLink } from "../src/server.js";
import { createMockFetch, flush, makeBootstrap, makeSurvey } from "./helpers.js";

describe("deferAsk / resolveTask({defer:true})", () => {
  beforeEach(() => {
    __resetAnonMemoryForTests();
  });
  afterEach(() => {
    __resetAnonMemoryForTests();
  });

  it("resolveTask({defer:true}) closes task but does not show InlineFeedback", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_def" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_d", surveySlug: "nps-q1" });
    c.identify({ userId: "u_def" });
    await flush(20);

    expect(c.isTaskOpen()).toBe(true);
    c.resolveTask({ defer: true, outcome: "refund_pending" });
    await flush(10);

    expect(c.isTaskOpen()).toBe(false);
    expect(c.getActive()).toBeNull();
  });

  it("deferAsk() alias also suppresses in-session ask", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_d2" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_d2", surveySlug: "nps-q1" });
    c.identify({ userId: "u_d2" });
    await flush(20);

    c.deferAsk({ outcome: "later" });
    await flush(10);
    expect(c.isTaskOpen()).toBe(false);
    expect(c.getActive()).toBeNull();
  });

  it("deferred in-app redemption honors open-task bar", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_red" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_red", surveySlug: "nps-q1" });
    c.identify({ userId: "u_red" });
    await flush(20);

    c.resolveTask({ defer: true });
    await flush(10);
    expect(c.isTaskOpen()).toBe(false);

    // New user turn re-opens the task (blocking mode).
    c.noteUserTurn();
    expect(c.isTaskOpen()).toBe(true);

    // Attempting to show (e.g. redeeming a deferred ask mid-next-task) is barred.
    c.survey("nps-q1");
    await flush(10);
    expect(c.getActive()).toBeNull();

    // After the next resolve, show is allowed again.
    c.resolveTask({ outcome: "done" });
    await flush(10);
    expect(c.getActive()?.showToken).toBe("tok_red");
  });
});

describe("mintDeferredAskLink", () => {
  it("POSTs /v1/sdk/deferred-ask-link with secret and returns url + showToken", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.uservane.com/v1/sdk/deferred-ask-link");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer uv_sk_test");
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body.respondentId).toBe("u1");
      expect(body.surveyId).toBe("surv_1");
      expect(body.sessionId).toBe("sess_1");
      return new Response(
        JSON.stringify({
          ok: true,
          url: "https://api.uservane.com/l/abcTOKEN",
          showToken: "tok_deferred",
          issuedAt: "2026-07-27T00:00:00.000Z",
          surveyId: "surv_1",
          respondentId: "u1",
          sessionId: "sess_1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const result = await mintDeferredAskLink({
      secretKey: "uv_sk_test",
      respondentId: "u1",
      surveyId: "surv_1",
      sessionId: "sess_1",
      fetchImpl,
    });

    expect(result.url).toBe("https://api.uservane.com/l/abcTOKEN");
    expect(result.showToken).toBe("tok_deferred");
    expect(result.respondentId).toBe("u1");
    expect(result.sessionId).toBe("sess_1");
  });

  it("rejects missing secretKey before network", async () => {
    await expect(
      mintDeferredAskLink({
        secretKey: "",
        respondentId: "u1",
        surveyId: "surv_1",
      }),
    ).rejects.toThrow(/secretKey/);
  });
});
