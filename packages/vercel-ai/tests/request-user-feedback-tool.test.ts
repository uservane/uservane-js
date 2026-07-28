/**
 * Vercel AI createRequestUserFeedbackTool delegates to handleRequestUserFeedback.
 */

import { __resetAnonMemoryForTests, AgentController } from "@uservane/agent-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestUserFeedbackTool } from "../src/request-user-feedback-tool.js";

vi.mock("@uservane/agent-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uservane/agent-core")>();
  return {
    ...actual,
    handleRequestUserFeedback: vi.fn(actual.handleRequestUserFeedback),
  };
});

import { handleRequestUserFeedback } from "@uservane/agent-core";

describe("createRequestUserFeedbackTool (vercel-ai)", () => {
  beforeEach(() => {
    __resetAnonMemoryForTests();
    vi.mocked(handleRequestUserFeedback).mockClear();
  });
  afterEach(() => {
    __resetAnonMemoryForTests();
  });

  it("tool execute delegates to handleRequestUserFeedback with the controller", async () => {
    const c = new AgentController();
    const t = createRequestUserFeedbackTool(c);
    expect(t).toBeTruthy();
    expect(typeof t.execute).toBe("function");

    vi.mocked(handleRequestUserFeedback).mockReturnValue({
      ok: false,
      status: "task_open",
      message: "not now: a task is in progress",
    });

    expect(typeof t.execute).toBe("function");
    const execute = t.execute;
    if (!execute) throw new Error("expected execute");
    const out = await execute({}, {
      toolCallId: "tc1",
      messages: [],
    } as never);

    expect(handleRequestUserFeedback).toHaveBeenCalledWith(c, {});
    expect(out).toMatchObject({ ok: false, status: "task_open" });
  });
});
