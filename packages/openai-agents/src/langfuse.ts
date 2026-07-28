/**
 * @uservane/openai-agents/langfuse - scoped Langfuse trace-bridge for OpenAI Agents.
 *
 * SECURITY: This module MUST run only on the CUSTOMER's server. It holds the
 * customer's Langfuse write keys. UserVane never receives, stores, or transmits
 * those keys. Never import from a client component or browser bundle.
 *
 * SCOPE BOUNDARY (honest):
 *   UserVane's bridge guarantees the Langfuse SESSION exists (sessionId = groupId)
 *   (`sessionId = groupId`, plus the trace name and any RunConfig.traceMetadata)
 *   so the `uservane.satisfaction` session-score (delivered by
 *   @uservane/langfuse-push) has a home. It is NOT a full agent tracer: the
 *   @openai/agents Trace carries no input/output fields, so agent I/O, latency,
 *   and the tool / handoff / realtime tree are out of scope. Use your agent
 *   framework's own tracer for those.
 *
 * Verified symbols (@openai/agents@0.13.5 / langfuse@3.38.20, 2026-07-27):
 * - `setTraceProcessors`, `BatchTraceProcessor`, `TracingExporter`, `TracingProcessor`
 *   from `@openai/agents` (re-exported from `@openai/agents-core`)
 * - Trace fields: `traceId`, `name`, `groupId`, `metadata`, `toJSON()`
 * - Langfuse: `new Langfuse({ publicKey, secretKey, baseUrl? })`,
 *   `langfuse.trace({ id, name, sessionId, metadata, tags })` (we do NOT pass
 *   input/output - the Agents Trace has none), `flush(cb)` for delivery
 *   confirmation (NOT flushAsync, which swallows failures)
 */

import { Langfuse } from "langfuse";

/** Minimal Agents Trace surface we read (matches installed Trace class). */
export type AgentsTraceLike = {
  type?: string;
  traceId: string;
  name: string;
  groupId: string | null;
  metadata?: Record<string, unknown>;
  toJSON?: (options?: { includeTracingApiKey?: boolean }) => object | null;
};

/** Minimal Agents Span surface (optional essentials only; not full fidelity). */
export type AgentsSpanLike = {
  type?: string;
  spanId?: string;
  traceId?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  spanData?: Record<string, unknown>;
};

/** Injectable Langfuse surface (matches what we call; tests inject a fake). */
export type LangfuseTraceClient = {
  trace(body: {
    id?: string;
    name?: string | null;
    sessionId?: string | null;
    input?: unknown;
    output?: unknown;
    metadata?: unknown;
    tags?: string[] | null;
    timestamp?: string | null;
  }): unknown;
  /**
   * Drain the ingestion queue via callback. Use flush(cb), NOT flushAsync():
   * flushAsync swallows ingestion HTTP failures (langfuse-core lesson shared
   * with @uservane/langfuse-push).
   */
  flush(callback: (err?: unknown) => void): void;
};

export type LangfuseBridgeOpts = {
  langfuse: {
    publicKey: string;
    secretKey: string;
    baseUrl?: string;
  };
  /**
   * Injected Langfuse client factory (tests). Production builds
   * `new Langfuse({ publicKey, secretKey, baseUrl })`.
   */
  createLangfuse?: (cfg: {
    publicKey: string;
    secretKey: string;
    baseUrl?: string;
  }) => LangfuseTraceClient;
  /**
   * Injected setTraceProcessors (tests). Production uses
   * `setTraceProcessors` from `@openai/agents`.
   */
  setTraceProcessors?: (processors: unknown[]) => void;
  /**
   * Injected BatchTraceProcessor constructor (tests). Production uses
   * `BatchTraceProcessor` from `@openai/agents`.
   */
  BatchTraceProcessor?: new (
    exporter: UserVaneLangfuseExporter,
    opts?: Record<string, unknown>,
  ) => unknown;
  /** When true, log skip reasons (no groupId, etc.). */
  debug?: boolean;
};

export type ExportOutcome = {
  exported: number;
  skippedNoGroupId: number;
  flushError?: unknown;
};

function isTrace(item: AgentsTraceLike | AgentsSpanLike): item is AgentsTraceLike {
  if (!item || typeof item !== "object") return false;
  // Prefer explicit type tag; fall back to Trace-shaped objects from the SDK.
  if ((item as AgentsTraceLike).type === "trace") return true;
  if ((item as AgentsSpanLike).type === "span") return false;
  return (
    typeof (item as AgentsTraceLike).traceId === "string" &&
    typeof (item as AgentsTraceLike).name === "string" &&
    "groupId" in item
  );
}

/**
 * Scoped TracingExporter: one Langfuse trace per Agents Trace with
 * sessionId = groupId. Skips traces without groupId (no orphan sessions).
 *
 * Implements the `export(items)` shape of `@openai/agents` TracingExporter.
 */
export class UserVaneLangfuseExporter {
  private lf: LangfuseTraceClient;
  private debug: boolean;
  /** Last export outcomes (tests / ops). */
  lastOutcome: ExportOutcome | null = null;

  constructor(lf: LangfuseTraceClient, debug = false) {
    this.lf = lf;
    this.debug = debug;
  }

  async export(items: Array<AgentsTraceLike | AgentsSpanLike>): Promise<void> {
    let exported = 0;
    let skippedNoGroupId = 0;

    for (const item of items) {
      if (!isTrace(item)) {
        // Scope boundary: ignore spans (no full-fidelity tool/handoff tree).
        continue;
      }

      const groupId =
        typeof item.groupId === "string" && item.groupId.length > 0 ? item.groupId : null;
      if (groupId === null) {
        skippedNoGroupId += 1;
        if (this.debug) {
          // eslint-disable-next-line no-console
          console.info(
            "[uservane/openai-agents/langfuse] skip trace without groupId (no orphan session)",
            item.traceId,
          );
        }
        continue;
      }

      // Scope: this bridge GUARANTEES the Langfuse session exists (sessionId=groupId)
      // so the uservane.satisfaction session-score has a home. It does NOT capture the
      // agent's input/output/latency or a full tool/handoff tree: the @openai/agents
      // `Trace` carries no input/output fields, and its `metadata` is the developer's
      // RunConfig.traceMetadata (Record<string,string>) only. We pass that metadata
      // through verbatim; use your agent framework's own tracer for full-fidelity I/O.
      const meta = item.metadata && typeof item.metadata === "object" ? item.metadata : undefined;

      this.lf.trace({
        id: item.traceId,
        name: item.name || "uservane.agent-run",
        sessionId: groupId,
        metadata: {
          source: "uservane-openai-agents-bridge",
          scope: "session-guarantee-not-full-tracer",
          agentsGroupId: groupId,
          ...(meta ?? {}),
        },
        tags: ["uservane", "openai-agents"],
      });
      exported += 1;
    }

    let flushError: unknown;
    if (exported > 0) {
      flushError = await new Promise<unknown>((resolve) => {
        try {
          this.lf.flush((err?: unknown) => resolve(err ?? null));
        } catch (err) {
          resolve(err ?? new Error("flush threw"));
        }
      });
      if (flushError && this.debug) {
        // eslint-disable-next-line no-console
        console.error(
          "[uservane/openai-agents/langfuse] Langfuse flush failed (not silent)",
          flushError,
        );
      }
    }

    this.lastOutcome = {
      exported,
      skippedNoGroupId,
      ...(flushError ? { flushError } : {}),
    };

    if (flushError) {
      // Surface failure to the Agents processor path (BatchTraceProcessor awaits export).
      throw flushError instanceof Error ? flushError : new Error(String(flushError));
    }
  }
}

/**
 * Build a processor list without installing (for hosts that compose processors).
 */
export function createLangfuseBridgeProcessor(
  opts: Omit<LangfuseBridgeOpts, "setTraceProcessors"> & {
    langfuseClient?: LangfuseTraceClient;
  },
): { exporter: UserVaneLangfuseExporter; processor: unknown } {
  if (
    !opts?.langfuse ||
    typeof opts.langfuse.publicKey !== "string" ||
    opts.langfuse.publicKey.length === 0 ||
    typeof opts.langfuse.secretKey !== "string" ||
    opts.langfuse.secretKey.length === 0
  ) {
    // Allow injected client without keys (tests).
    if (!opts.langfuseClient) {
      throw new Error(
        "createLangfuseBridgeProcessor: langfuse.publicKey and langfuse.secretKey are required",
      );
    }
  }

  const createLf =
    opts.createLangfuse ??
    ((cfg: { publicKey: string; secretKey: string; baseUrl?: string }) =>
      new Langfuse({
        publicKey: cfg.publicKey,
        secretKey: cfg.secretKey,
        ...(cfg.baseUrl !== undefined ? { baseUrl: cfg.baseUrl } : {}),
      }) as unknown as LangfuseTraceClient);

  const lf =
    opts.langfuseClient ??
    createLf({
      publicKey: opts.langfuse.publicKey,
      secretKey: opts.langfuse.secretKey,
      ...(opts.langfuse.baseUrl !== undefined ? { baseUrl: opts.langfuse.baseUrl } : {}),
    });

  const exporter = new UserVaneLangfuseExporter(lf, opts.debug === true);

  const BatchCtor = opts.BatchTraceProcessor;
  if (!BatchCtor) {
    // Lazy: production path imports from @openai/agents.
    // Tests inject BatchTraceProcessor to avoid loading the peer.
    throw new Error(
      "createLangfuseBridgeProcessor: BatchTraceProcessor is required (pass inject or use installLangfuseBridge)",
    );
  }

  const processor = new BatchCtor(exporter);
  return { exporter, processor };
}

/**
 * Install the scoped Langfuse bridge as the Agents SDK trace processor set.
 *
 * Replaces existing processors via `setTraceProcessors([BatchTraceProcessor(exporter)])`.
 * Returns the exporter so tests can inspect `lastOutcome`.
 *
 * ```ts
 * import { installLangfuseBridge } from "@uservane/openai-agents/langfuse";
 *
 * installLangfuseBridge({
 *   langfuse: {
 *     publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
 *     secretKey: process.env.LANGFUSE_SECRET_KEY!,
 *   },
 * });
 * // then run agents with groupId set to your session id
 * ```
 */
export async function installLangfuseBridge(
  opts: LangfuseBridgeOpts,
): Promise<UserVaneLangfuseExporter> {
  if (
    !opts?.langfuse ||
    typeof opts.langfuse.publicKey !== "string" ||
    opts.langfuse.publicKey.length === 0 ||
    typeof opts.langfuse.secretKey !== "string" ||
    opts.langfuse.secretKey.length === 0
  ) {
    throw new Error(
      "installLangfuseBridge: langfuse.publicKey and langfuse.secretKey are required (customer server only)",
    );
  }

  let setProcessors = opts.setTraceProcessors;
  let BatchCtor = opts.BatchTraceProcessor;

  if (!setProcessors || !BatchCtor) {
    const agents = (await import("@openai/agents")) as {
      setTraceProcessors: (processors: unknown[]) => void;
      BatchTraceProcessor: new (
        exporter: UserVaneLangfuseExporter,
        opts?: Record<string, unknown>,
      ) => unknown;
    };
    setProcessors = setProcessors ?? agents.setTraceProcessors;
    BatchCtor = BatchCtor ?? agents.BatchTraceProcessor;
  }

  const createLf =
    opts.createLangfuse ??
    ((cfg: { publicKey: string; secretKey: string; baseUrl?: string }) =>
      new Langfuse({
        publicKey: cfg.publicKey,
        secretKey: cfg.secretKey,
        ...(cfg.baseUrl !== undefined ? { baseUrl: cfg.baseUrl } : {}),
      }) as unknown as LangfuseTraceClient);

  const lf = createLf({
    publicKey: opts.langfuse.publicKey,
    secretKey: opts.langfuse.secretKey,
    ...(opts.langfuse.baseUrl !== undefined ? { baseUrl: opts.langfuse.baseUrl } : {}),
  });

  if (!BatchCtor || !setProcessors) {
    throw new Error(
      "installLangfuseBridge: BatchTraceProcessor and setTraceProcessors are required",
    );
  }

  const exporter = new UserVaneLangfuseExporter(lf, opts.debug === true);
  const processor = new BatchCtor(exporter);
  setProcessors([processor]);
  return exporter;
}
