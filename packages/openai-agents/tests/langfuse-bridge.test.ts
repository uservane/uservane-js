/**
 * Langfuse bridge: groupId -> sessionId, no orphan without groupId,
 * flush(cb) delivery confirmation (not silent loss).
 */
import { describe, expect, it, vi } from "vitest";
import {
  type AgentsTraceLike,
  installLangfuseBridge,
  type LangfuseTraceClient,
  UserVaneLangfuseExporter,
} from "../src/langfuse.js";

function makeLf() {
  const traces: unknown[] = [];
  let flushErr: unknown = null;
  const lf: LangfuseTraceClient = {
    trace(body) {
      traces.push(body);
      return lf;
    },
    flush(cb) {
      cb(flushErr ?? undefined);
    },
  };
  return {
    lf,
    traces,
    setFlushError(err: unknown) {
      flushErr = err;
    },
  };
}

describe("UserVaneLangfuseExporter", () => {
  it("maps groupId to Langfuse sessionId and creates a session-scoped trace", async () => {
    const { lf, traces } = makeLf();
    const exporter = new UserVaneLangfuseExporter(lf);

    // Real @openai/agents traceMetadata is Record<string,string>; it never carries the
    // agent's input/output. The bridge passes traceMetadata THROUGH but does not lift
    // any field to a top-level trace input/output (it guarantees the session, not I/O).
    const trace: AgentsTraceLike = {
      type: "trace",
      traceId: "trace_abc",
      name: "Customer support agent",
      groupId: "sess_chat_1",
      metadata: { tenant: "acme" },
    };

    await exporter.export([trace]);

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      id: "trace_abc",
      name: "Customer support agent",
      sessionId: "sess_chat_1",
      tags: ["uservane", "openai-agents"],
    });
    // Session-guarantee scope: no top-level input/output lifted from the trace.
    expect(traces[0]).not.toHaveProperty("input");
    expect(traces[0]).not.toHaveProperty("output");
    // Developer traceMetadata is passed through under metadata.
    expect((traces[0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      agentsGroupId: "sess_chat_1",
      tenant: "acme",
    });
    expect(exporter.lastOutcome).toEqual({ exported: 1, skippedNoGroupId: 0 });
  });

  it("skips traces without groupId (no orphan session)", async () => {
    const { lf, traces } = makeLf();
    const exporter = new UserVaneLangfuseExporter(lf, true);

    await exporter.export([
      {
        type: "trace",
        traceId: "trace_orphan",
        name: "no-group",
        groupId: null,
      },
    ]);

    expect(traces).toHaveLength(0);
    expect(exporter.lastOutcome).toEqual({ exported: 0, skippedNoGroupId: 1 });
  });

  it("ignores spans (scope: not a full tracer)", async () => {
    const { lf, traces } = makeLf();
    const exporter = new UserVaneLangfuseExporter(lf);

    await exporter.export([
      {
        type: "span",
        spanId: "span_1",
        traceId: "t1",
        spanData: { type: "function", name: "tool", input: "x", output: "y" },
      },
    ]);

    expect(traces).toHaveLength(0);
    expect(exporter.lastOutcome?.exported).toBe(0);
  });

  it("confirms delivery via flush(cb) and surfaces failure (not silent)", async () => {
    const { lf, setFlushError } = makeLf();
    setFlushError(new Error("langfuse ingestion failed: 401"));
    const exporter = new UserVaneLangfuseExporter(lf);

    await expect(
      exporter.export([
        {
          type: "trace",
          traceId: "t_fail",
          name: "run",
          groupId: "sess_fail",
        },
      ]),
    ).rejects.toThrow(/langfuse ingestion failed/);

    expect(exporter.lastOutcome?.exported).toBe(1);
    expect(exporter.lastOutcome?.flushError).toBeTruthy();
  });
});

describe("installLangfuseBridge", () => {
  it("installs BatchTraceProcessor via setTraceProcessors with injected deps", async () => {
    const { lf, traces } = makeLf();
    const processors: unknown[] = [];
    const setTraceProcessors = vi.fn((ps: unknown[]) => {
      processors.push(...ps);
    });

    class FakeBatch {
      exporter: UserVaneLangfuseExporter;
      constructor(exporter: UserVaneLangfuseExporter) {
        this.exporter = exporter;
      }
    }

    const exporter = await installLangfuseBridge({
      langfuse: { publicKey: "pk-lf", secretKey: "sk-lf" },
      createLangfuse: () => lf,
      setTraceProcessors,
      BatchTraceProcessor: FakeBatch as unknown as new (e: UserVaneLangfuseExporter) => unknown,
    });

    expect(setTraceProcessors).toHaveBeenCalledTimes(1);
    expect(processors).toHaveLength(1);
    expect(processors[0]).toBeInstanceOf(FakeBatch);

    // Drive the exporter as BatchTraceProcessor would.
    await exporter.export([
      {
        type: "trace",
        traceId: "t_install",
        name: "installed",
        groupId: "sess_installed",
      },
    ]);
    expect(traces[0]).toMatchObject({
      sessionId: "sess_installed",
      id: "t_install",
    });
  });

  it("rejects missing Langfuse keys", async () => {
    await expect(
      installLangfuseBridge({
        langfuse: { publicKey: "", secretKey: "" },
      }),
    ).rejects.toThrow(/publicKey|secretKey/);
  });
});
