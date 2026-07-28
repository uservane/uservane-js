/**
 * handleRequestUserFeedback: task-open bar, amr gate, show + structured result, never throws.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetAnonMemoryForTests } from "../src/anonymous-key.js";
import { AgentController } from "../src/controller.js";
import { handleRequestUserFeedback } from "../src/request-user-feedback.js";
import { createMockFetch, flush, makeBootstrap, makeSurvey } from "./helpers.js";

/** Build a fake show-token payload with optional amr (unsigned; controller only reads amr). */
function fakeToken(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  // base64url of payload + dummy sig
  const b64 = Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${b64}.fakesig`;
}

describe("handleRequestUserFeedback", () => {
  beforeEach(() => {
    __resetAnonMemoryForTests();
  });
  afterEach(() => {
    __resetAnonMemoryForTests();
  });

  it("refuses while a task is open", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_x" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_t", surveySlug: "nps-q1" });
    c.identify({ userId: "u1" });
    await flush(20);

    expect(c.isTaskOpen()).toBe(true);
    const result = handleRequestUserFeedback(c);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("task_open");
      expect(result.message).toMatch(/task is in progress/i);
    }
    expect(c.getActive()).toBeNull();
  });

  it("refuses when no bound token attests amr", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_x" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_t", surveySlug: "nps-q1", nonBlocking: true });
    c.identify({ userId: "u1" });
    await flush(20);

    // Bound token without amr
    c.bind({
      surveyId: survey.id,
      showToken: fakeToken({
        v: 2,
        surveyId: survey.id,
        respondentId: "u1",
        issuedAt: new Date().toISOString(),
        nonce: "n1",
        sessionId: "sess_1",
      }),
      sessionId: "sess_1",
    });

    const result = handleRequestUserFeedback(c);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("not_enabled");
      expect(result.message).toMatch(/not enabled/i);
    }
  });

  it("fires the ask with identityKind model-requested when enabled", async () => {
    const survey = makeSurvey();
    const amrToken = fakeToken({
      v: 2,
      surveyId: survey.id,
      respondentId: "u1",
      issuedAt: new Date().toISOString(),
      nonce: "n_amr",
      sessionId: "sess_amr",
      amr: true,
    });
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_boot" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_amr", surveySlug: "nps-q1", nonBlocking: true });
    c.identify({ userId: "u1" });
    await flush(20);

    c.bind({
      surveyId: survey.id,
      showToken: amrToken,
      sessionId: "sess_amr",
    });

    const result = handleRequestUserFeedback(c);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("feedback_requested");
      expect(result.surveySlug).toBe("nps-q1");
      expect(result.message).toMatch(/feedback requested/i);
    }
    const active = c.getActive();
    expect(active).not.toBeNull();
    expect(active?.identityKind).toBe("model-requested");
    expect(active?.showToken).toBe(amrToken);

    c.complete({ rating: 8 });
    await flush(20);
    expect(mock.submittedBodies).toHaveLength(1);
    const submitted = mock.submittedBodies[0] as { identityKind?: string };
    expect(submitted.identityKind).toBe("model-requested");
  });

  it("never throws even if controller methods throw", () => {
    const bad = {
      isTaskOpen: () => {
        throw new Error("boom");
      },
    } as unknown as AgentController;
    const result = handleRequestUserFeedback(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("show_refused");
  });
});
