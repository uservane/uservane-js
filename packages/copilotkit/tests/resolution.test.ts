/**
 * Unit tests for pure resolution edge logic (no React, no CopilotKit runtime).
 */
import { describe, expect, it } from "vitest";
import { evaluateResolutionEdge, latestAssistantMessageId } from "../src/resolution.js";

describe("latestAssistantMessageId", () => {
  it("returns the newest assistant id", () => {
    const id = latestAssistantMessageId([
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
      { id: "u2", role: "user" },
      { id: "a2", role: "assistant" },
    ]);
    expect(id).toBe("a2");
  });

  it("returns undefined when no assistant messages", () => {
    expect(latestAssistantMessageId([{ id: "u1", role: "user" }])).toBeUndefined();
    expect(latestAssistantMessageId([])).toBeUndefined();
    expect(latestAssistantMessageId(null)).toBeUndefined();
  });
});

describe("evaluateResolutionEdge", () => {
  it("fires once on isLoading true->false and dedupes by message id", () => {
    const fired = new Set<string>();
    const messages = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
    ];

    // not yet an edge
    let r = evaluateResolutionEdge({
      isLoading: true,
      wasLoading: false,
      suppressed: false,
      messages,
      alreadyFired: fired,
      turnCounter: 0,
    });
    expect(r.fire).toBe(false);
    expect(r.reason).toBe("not-edge");

    // true -> false: fire
    r = evaluateResolutionEdge({
      isLoading: false,
      wasLoading: true,
      suppressed: false,
      messages,
      alreadyFired: fired,
      turnCounter: 0,
    });
    expect(r.fire).toBe(true);
    expect(r.fireKey).toBe("a1");
    if (r.fireKey) fired.add(r.fireKey);

    // second false (re-render): not an edge
    r = evaluateResolutionEdge({
      isLoading: false,
      wasLoading: false,
      suppressed: false,
      messages,
      alreadyFired: fired,
      turnCounter: 0,
    });
    expect(r.fire).toBe(false);
    expect(r.reason).toBe("not-edge");

    // another true->false with same message id: deduped
    r = evaluateResolutionEdge({
      isLoading: false,
      wasLoading: true,
      suppressed: false,
      messages,
      alreadyFired: fired,
      turnCounter: 0,
    });
    expect(r.fire).toBe(false);
    expect(r.reason).toBe("deduped");
    expect(r.fireKey).toBe("a1");
  });

  it("fires again for a new assistant message id (next turn)", () => {
    const fired = new Set<string>(["a1"]);
    const r = evaluateResolutionEdge({
      isLoading: false,
      wasLoading: true,
      suppressed: false,
      messages: [
        { id: "u1", role: "user" },
        { id: "a1", role: "assistant" },
        { id: "u2", role: "user" },
        { id: "a2", role: "assistant" },
      ],
      alreadyFired: fired,
      turnCounter: 0,
    });
    expect(r.fire).toBe(true);
    expect(r.fireKey).toBe("a2");
  });

  it("suppresses when stop/interrupt ended the turn", () => {
    const r = evaluateResolutionEdge({
      isLoading: false,
      wasLoading: true,
      suppressed: true,
      messages: [{ id: "a1", role: "assistant" }],
      alreadyFired: new Set(),
      turnCounter: 0,
    });
    expect(r.fire).toBe(false);
    expect(r.reason).toBe("suppressed");
  });

  it("uses a synthetic turn key when no assistant id is available", () => {
    const r = evaluateResolutionEdge({
      isLoading: false,
      wasLoading: true,
      suppressed: false,
      messages: [{ id: "u1", role: "user" }],
      alreadyFired: new Set(),
      turnCounter: 3,
    });
    expect(r.fire).toBe(true);
    expect(r.fireKey).toBe("turn:4");
    expect(r.nextTurnCounter).toBe(4);
  });
});
