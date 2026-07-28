/**
 * OpenAI Agents createRequestUserFeedbackTool delegates to handleRequestUserFeedback.
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

describe("createRequestUserFeedbackTool (openai-agents)", () => {
  beforeEach(() => {
    __resetAnonMemoryForTests();
    vi.mocked(handleRequestUserFeedback).mockClear();
  });
  afterEach(() => {
    __resetAnonMemoryForTests();
  });

  it("tool name/description match core descriptor and execute delegates", async () => {
    const c = new AgentController();
    const t = createRequestUserFeedbackTool(c);
    expect(t.name).toBe("request_user_feedback");
    expect(t.description).toMatch(/feedback/i);
    expect(t.description).not.toMatch(/praise|love|rate us/i);

    vi.mocked(handleRequestUserFeedback).mockReturnValue({
      ok: false,
      status: "not_enabled",
      message: "feedback tool not enabled",
    });

    // FunctionTool.invoke is the runtime entry; execute is wrapped into invoke.
    const out = await t.invoke({} as never, "{}");
    expect(handleRequestUserFeedback).toHaveBeenCalledWith(c);
    expect(out).toMatchObject({ ok: false, status: "not_enabled" });
  });
});
