/**
 * Hook tests: resolution fires once on isLoading edge, dedupes, suppresses stop.
 * Mocks @copilotkit/react-core - no live backend.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chatState = vi.hoisted(() => ({
  isLoading: false,
  messages: [] as Array<{ id: string; role: string }>,
  interrupt: null as string | null,
  threadId: "thread_abc" as string | undefined,
  stopGeneration: vi.fn(),
  onStopGeneration: undefined as undefined | (() => void),
  agent: {
    isRunning: false,
    messages: [] as Array<{ id: string; role: string }>,
    abortRun: vi.fn(),
  },
}));

const contextState = vi.hoisted(() => ({
  threadId: "thread_abc" as string | undefined,
}));

vi.mock("@copilotkit/react-core", () => ({
  useCopilotContext: () => ({ threadId: contextState.threadId }),
  useCopilotChatInternal: (opts?: { onStopGeneration?: () => void }) => {
    chatState.onStopGeneration = opts?.onStopGeneration;
    return {
      isLoading: chatState.isLoading,
      messages: chatState.messages,
      interrupt: chatState.interrupt,
      threadId: chatState.threadId,
      agent: chatState.agent,
      stopGeneration: () => {
        chatState.onStopGeneration?.();
        chatState.stopGeneration();
        chatState.isLoading = false;
      },
      appendMessage: vi.fn(),
      reloadMessages: vi.fn(),
      reset: vi.fn(),
      isAvailable: true,
      runChatCompletion: vi.fn(),
      mcpServers: [],
      setMcpServers: vi.fn(),
    };
  },
}));

import { type ResolutionInfo, useUserVaneCopilotResolution } from "../src/use-resolution.js";

beforeEach(() => {
  chatState.isLoading = false;
  chatState.messages = [];
  chatState.interrupt = null;
  chatState.threadId = "thread_abc";
  chatState.stopGeneration = vi.fn();
  chatState.onStopGeneration = undefined;
  chatState.agent = {
    isRunning: false,
    messages: [],
    abortRun: vi.fn(),
  };
  contextState.threadId = "thread_abc";
});

describe("useUserVaneCopilotResolution", () => {
  it("fires once on isLoading true->false and does not re-fire on re-render", async () => {
    const resolves: ResolutionInfo[] = [];
    const { rerender, result } = renderHook(() =>
      useUserVaneCopilotResolution({
        onResolve: (info) => {
          resolves.push(info);
        },
      }),
    );

    // start generation
    chatState.isLoading = true;
    chatState.messages = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
    ];
    await act(async () => {
      rerender();
    });

    // complete
    chatState.isLoading = false;
    await act(async () => {
      rerender();
    });

    expect(resolves).toHaveLength(1);
    expect(resolves[0]?.fireKey).toBe("a1");
    expect(resolves[0]?.threadId).toBe("thread_abc");
    expect(resolves[0]?.unbound).toBe(false);
    expect(result.current.firedKeys.has("a1")).toBe(true);

    // re-render while still not loading: no second fire
    await act(async () => {
      rerender();
    });
    expect(resolves).toHaveLength(1);

    // another false edge with same id (wasLoading forced true): still deduped
    chatState.isLoading = true;
    await act(async () => {
      rerender();
    });
    chatState.isLoading = false;
    await act(async () => {
      rerender();
    });
    expect(resolves).toHaveLength(1);
  });

  it("suppresses when stopGeneration ends the turn", async () => {
    const resolves: ResolutionInfo[] = [];
    const { rerender, result } = renderHook(() =>
      useUserVaneCopilotResolution({
        onResolve: (info) => {
          resolves.push(info);
        },
      }),
    );

    chatState.isLoading = true;
    chatState.messages = [{ id: "a_stop", role: "assistant" }];
    await act(async () => {
      rerender();
    });

    // user hits stop
    await act(async () => {
      result.current.stopGeneration();
      rerender();
    });

    expect(resolves).toHaveLength(0);
    expect(chatState.stopGeneration).toHaveBeenCalled();
  });

  it("suppresses when a sibling UI aborts via agent.abortRun (CopilotChat stop)", async () => {
    const resolves: ResolutionInfo[] = [];
    const { rerender } = renderHook(() =>
      useUserVaneCopilotResolution({
        onResolve: (info) => {
          resolves.push(info);
        },
      }),
    );

    chatState.isLoading = true;
    chatState.messages = [{ id: "a_abort", role: "assistant" }];
    await act(async () => {
      rerender();
    });

    // Simulate CopilotChat's stop button: shared agent.abortRun, no our callback.
    await act(async () => {
      chatState.agent.abortRun();
      chatState.isLoading = false;
      rerender();
    });

    expect(resolves).toHaveLength(0);
  });

  it("suppresses when HITL interrupt is active at the edge", async () => {
    const resolves: ResolutionInfo[] = [];
    const { rerender } = renderHook(() =>
      useUserVaneCopilotResolution({
        onResolve: (info) => {
          resolves.push(info);
        },
      }),
    );

    chatState.isLoading = true;
    chatState.messages = [{ id: "a_int", role: "assistant" }];
    await act(async () => {
      rerender();
    });

    chatState.isLoading = false;
    chatState.interrupt = "<Confirm?>";
    await act(async () => {
      rerender();
    });

    expect(resolves).toHaveLength(0);
  });

  it("flags unbound when threadId is absent", async () => {
    contextState.threadId = undefined;
    chatState.threadId = undefined;
    const resolves: ResolutionInfo[] = [];
    const { rerender } = renderHook(() =>
      useUserVaneCopilotResolution({
        onResolve: (info) => {
          resolves.push(info);
        },
      }),
    );

    chatState.isLoading = true;
    chatState.messages = [{ id: "a_u", role: "assistant" }];
    await act(async () => {
      rerender();
    });
    chatState.isLoading = false;
    await act(async () => {
      rerender();
    });

    expect(resolves).toHaveLength(1);
    expect(resolves[0]?.unbound).toBe(true);
    expect(resolves[0]?.threadId).toBeUndefined();
    expect(resolves[0]?.reason).toMatch(/threadId absent/i);
  });

  it("fires for a second turn with a new assistant message id", async () => {
    const resolves: ResolutionInfo[] = [];
    const { rerender } = renderHook(() =>
      useUserVaneCopilotResolution({
        onResolve: (info) => {
          resolves.push(info);
        },
      }),
    );

    // turn 1
    chatState.isLoading = true;
    chatState.messages = [{ id: "a1", role: "assistant" }];
    await act(async () => {
      rerender();
    });
    chatState.isLoading = false;
    await act(async () => {
      rerender();
    });
    expect(resolves).toHaveLength(1);

    // turn 2
    chatState.isLoading = true;
    chatState.messages = [
      { id: "a1", role: "assistant" },
      { id: "a2", role: "assistant" },
    ];
    await act(async () => {
      rerender();
    });
    chatState.isLoading = false;
    await act(async () => {
      rerender();
    });
    expect(resolves).toHaveLength(2);
    expect(resolves[1]?.fireKey).toBe("a2");
  });

  it("restores agent.abortRun on unmount (no stale wrapper leak)", async () => {
    const original = chatState.agent.abortRun;
    const { unmount } = renderHook(() => useUserVaneCopilotResolution({}));
    // wrapped after mount (effect ran)
    expect(chatState.agent.abortRun).not.toBe(original);
    expect((chatState.agent.abortRun as { __uvPatched?: boolean }).__uvPatched).toBe(true);
    unmount();
    // restored to the exact original own-property fn - not a lingering bound wrapper
    expect(chatState.agent.abortRun).toBe(original);
  });

  it("wraps a shared agent.abortRun once across instances and suppresses all of them", async () => {
    const original = chatState.agent.abortRun;
    const resolvesA: ResolutionInfo[] = [];
    const resolvesB: ResolutionInfo[] = [];
    const a = renderHook(() =>
      useUserVaneCopilotResolution({ onResolve: (i) => resolvesA.push(i) }),
    );
    const b = renderHook(() =>
      useUserVaneCopilotResolution({ onResolve: (i) => resolvesB.push(i) }),
    );

    // exactly one wrapper installed (second instance sees __uvPatched, skips)
    const wrapped = chatState.agent.abortRun;
    expect((wrapped as { __uvPatched?: boolean }).__uvPatched).toBe(true);
    expect(wrapped).not.toBe(original);

    chatState.isLoading = true;
    chatState.messages = [{ id: "a_multi", role: "assistant" }];
    await act(async () => {
      a.rerender();
      b.rerender();
    });

    // CopilotChat stop -> shared abortRun: BOTH instances must suppress
    await act(async () => {
      chatState.agent.abortRun();
      chatState.isLoading = false;
      a.rerender();
      b.rerender();
    });

    expect(resolvesA).toHaveLength(0);
    expect(resolvesB).toHaveLength(0);
    expect(original).toHaveBeenCalledTimes(1); // wrapper still calls through

    a.unmount();
    b.unmount();
    expect(chatState.agent.abortRun).toBe(original); // fully restored
  });
});
