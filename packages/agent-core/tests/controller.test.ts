import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAnonMemoryForTests } from "../src/anonymous-key.js";
import { AgentController } from "../src/controller.js";
import { createMockFetch, flush, makeBootstrap, makeSurvey } from "./helpers.js";

describe("AgentController", () => {
  beforeEach(() => {
    __resetAnonMemoryForTests();
    try {
      localStorage.clear();
    } catch {
      // jsdom may lack storage in some envs
    }
  });

  afterEach(() => {
    __resetAnonMemoryForTests();
  });

  it("bars show while a task is open (default-open blocking mode)", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_1" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_test", surveySlug: "nps-q1", debug: true });
    c.identify({ userId: "u1" });
    await flush(20);

    expect(c.isTaskOpen()).toBe(true);
    c.survey("nps-q1");
    await flush(10);
    expect(c.getActive()).toBeNull();
  });

  it("resolveTask closes the task and runs show-decision", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_resolve" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_test", surveySlug: "nps-q1" });
    c.identify({ userId: "u1" });
    await flush(20);

    expect(c.isTaskOpen()).toBe(true);
    c.resolveTask({ outcome: "done" });
    await flush(10);

    expect(c.isTaskOpen()).toBe(false);
    const active = c.getActive();
    expect(active).not.toBeNull();
    expect(active?.showToken).toBe("tok_resolve");
    expect(active?.survey.slug).toBe("nps-q1");
  });

  it("mints and reuses an anonymous device key when no userId", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_anon" } }),
    );
    const c1 = new AgentController({ fetchImpl: mock.fetchImpl });
    c1.init({ key: "uv_pk_anon" });
    c1.identify({});
    await flush(20);

    const id1 = c1.getRespondentId();
    expect(id1).toBeTruthy();
    expect(c1.getIdentityKind()).toBe("anon-device");

    const c2 = new AgentController({ fetchImpl: mock.fetchImpl });
    c2.init({ key: "uv_pk_anon" });
    c2.identify({});
    await flush(10);
    expect(c2.getRespondentId()).toBe(id1);
    expect(c2.getIdentityKind()).toBe("anon-device");

    // Bootstrap must have sent the anon key as userId.
    const bootCall = mock.calls.find((x) => x.url.includes("/bootstrap"));
    expect(bootCall).toBeTruthy();
    const body = JSON.parse(String(bootCall?.init?.body ?? "{}")) as { userId?: string };
    expect(body.userId).toBe(id1);
  });

  it("snapshots correlation at show time and carries it to submit", async () => {
    const survey = makeSurvey({ followUpQuestion: undefined });
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_corr" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    let captureCount = 0;
    c.setCorrelationSource({
      capture: () => {
        captureCount += 1;
        return { sessionId: `sess_${captureCount}`, taskType: "refund" };
      },
    });
    c.init({ key: "uv_pk_corr", surveySlug: "nps-q1", nonBlocking: true });
    c.identify({ userId: "u_corr" });
    await flush(20);

    c.resolveTask();
    await flush(10);
    const active = c.getActive();
    expect(active?.correlation.sessionId).toBe("sess_1");
    expect(captureCount).toBe(1);

    // Mutate the source so a submit-time re-read would differ.
    c.setCorrelationSource({
      capture: () => ({ sessionId: "sess_SHOULD_NOT_USE" }),
    });

    c.complete({ rating: 9 });
    await flush(20);

    expect(mock.submittedBodies).toHaveLength(1);
    const submitted = mock.submittedBodies[0] as {
      sessionId?: string;
      taskType?: string;
      identityKind?: string;
      showToken?: string;
    };
    expect(submitted.sessionId).toBe("sess_1");
    expect(submitted.taskType).toBe("refund");
    expect(submitted.identityKind).toBe("identified");
    expect(submitted.showToken).toBe("tok_corr");
    // capture must not have been called again at submit
    expect(captureCount).toBe(1);
  });

  it("bind() uses server-provided bound token + sessionId on show and submit", async () => {
    const survey = makeSurvey({ followUpQuestion: undefined });
    // Bootstrap has an unbound token; bind should override with the bound one.
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_unbound" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_bind", surveySlug: "nps-q1", nonBlocking: true });
    c.identify({ userId: "u_bind" });
    await flush(20);

    c.bind({
      surveyId: survey.id,
      showToken: "tok_BOUND_v2",
      sessionId: "sess_from_server",
      taskType: "refund",
    });

    c.resolveTask();
    await flush(10);
    const active = c.getActive();
    expect(active).not.toBeNull();
    expect(active?.showToken).toBe("tok_BOUND_v2");
    expect(active?.correlation.sessionId).toBe("sess_from_server");
    expect(active?.correlation.taskType).toBe("refund");

    c.complete({ rating: 10 });
    await flush(20);

    expect(mock.submittedBodies).toHaveLength(1);
    const submitted = mock.submittedBodies[0] as {
      showToken?: string;
      sessionId?: string;
      taskType?: string;
    };
    expect(submitted.showToken).toBe("tok_BOUND_v2");
    expect(submitted.sessionId).toBe("sess_from_server");
    expect(submitted.taskType).toBe("refund");
  });

  it("bind() threads traceId + observationId into snapshot and submit", async () => {
    const survey = makeSurvey({ followUpQuestion: undefined });
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_unbound" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_obs", surveySlug: "nps-q1", nonBlocking: true });
    c.identify({ userId: "u_obs" });
    await flush(20);

    c.bind({
      surveyId: survey.id,
      showToken: "tok_OBS_v2",
      sessionId: "sess_obs",
      observationId: "obs_step_1",
      traceId: "trace_step_1",
      taskType: "tool_call",
    });

    c.resolveTask();
    await flush(10);
    const active = c.getActive();
    expect(active?.showToken).toBe("tok_OBS_v2");
    expect(active?.correlation).toEqual({
      sessionId: "sess_obs",
      observationId: "obs_step_1",
      traceId: "trace_step_1",
      taskType: "tool_call",
    });

    c.complete({ rating: 8 });
    await flush(20);

    const submitted = mock.submittedBodies[0] as {
      showToken?: string;
      sessionId?: string;
      observationId?: string;
      traceId?: string;
      taskType?: string;
    };
    expect(submitted.showToken).toBe("tok_OBS_v2");
    expect(submitted.sessionId).toBe("sess_obs");
    expect(submitted.observationId).toBe("obs_step_1");
    expect(submitted.traceId).toBe("trace_step_1");
    expect(submitted.taskType).toBe("tool_call");
  });

  it("without bind(), unbound bootstrap path still works", async () => {
    const survey = makeSurvey({ followUpQuestion: undefined });
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_unbound_only" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_ub", surveySlug: "nps-q1", nonBlocking: true });
    c.identify({ userId: "u_ub" });
    await flush(20);

    c.resolveTask();
    await flush(10);
    expect(c.getActive()?.showToken).toBe("tok_unbound_only");
    expect(c.getActive()?.correlation.sessionId).toBeUndefined();

    c.complete({ rating: 7 });
    await flush(20);
    const submitted = mock.submittedBodies[0] as { showToken?: string; sessionId?: string };
    expect(submitted.showToken).toBe("tok_unbound_only");
    expect(submitted.sessionId).toBeUndefined();
  });

  it("headless fail-safe: refuses to show when isTaskOpen contract is absent", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_h" } }),
    );
    const c = new AgentController({
      fetchImpl: mock.fetchImpl,
      headlessMode: true,
      // no headless contract
    });
    c.init({ key: "uv_pk_h", surveySlug: "nps-q1", nonBlocking: true });
    c.identify({ userId: "u_h" });
    await flush(20);

    c.resolveTask();
    await flush(10);
    expect(c.getActive()).toBeNull();
  });

  it("headless with contract: host isTaskOpen true bars show", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_h2" } }),
    );
    let hostOpen = true;
    const c = new AgentController({
      fetchImpl: mock.fetchImpl,
      headlessMode: true,
      headless: {
        isTaskOpen: () => hostOpen,
        onDismiss: vi.fn(),
      },
    });
    c.init({ key: "uv_pk_h2", surveySlug: "nps-q1", nonBlocking: true });
    c.identify({ userId: "u_h2" });
    await flush(20);

    c.resolveTask();
    await flush(10);
    expect(c.getActive()).toBeNull();

    hostOpen = false;
    c.survey("nps-q1");
    await flush(10);
    expect(c.getActive()?.showToken).toBe("tok_h2");
  });

  it("mechanical afterTurn never fires while not nonBlocking", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_m" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_m", surveySlug: "nps-q1" });
    c.identify({ userId: "u_m" });
    await flush(20);

    c.afterTurn(1);
    c.noteUserTurn();
    await flush(10);
    // noteUserTurn re-opens task; afterTurn is ignored in blocking mode
    expect(c.getActive()).toBeNull();
    expect(c.isTaskOpen()).toBe(true);
  });
});
