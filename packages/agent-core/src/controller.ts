/**
 * DOM-free agent survey controller (framework-agnostic).
 * Reuses @uservane/browser client + show-decision + sampling.
 * Adds task-open state machine, anonymous keys, and correlation seam.
 */

import {
  type BootstrapResponse,
  catchPromise,
  DEFAULT_API_BASE,
  decideShow,
  fetchBootstrap,
  findSurveyBySlug,
  log,
  logError,
  type SurveyDefinition,
  setDebug,
  submitResponse,
} from "@uservane/browser";
import { resolveAnonymousKey } from "./anonymous-key.js";
import { emptyCorrelationSource, hasAnyCorrelationId, unlinkReason } from "./correlation.js";
import { tokenAttestsModelRequested } from "./show-token-payload.js";
import type {
  ActiveAsk,
  AgentIdentifyOptions,
  AgentInitOptions,
  BoundTokenBinding,
  CompleteOptions,
  CorrelationSnapshot,
  CorrelationSource,
  HeadlessContract,
  IdentityKind,
  ResolveTaskOptions,
} from "./types.js";

export type AgentControllerListener = (active: ActiveAsk | null) => void;

export type AgentControllerDeps = {
  fetchImpl?: typeof fetch;
  /**
   * Headless-only hosts must supply isTaskOpen + onDismiss.
   * Absent contract in headless mode => refuse to show (fail-safe).
   */
  headless?: HeadlessContract | null;
  /** When true, shows require a headless contract (see headless fail-safe). */
  headlessMode?: boolean;
};

export class AgentController {
  private key: string | null = null;
  private apiBase = DEFAULT_API_BASE;
  private debug = false;
  private userId: string | null = null;
  private identityKind: IdentityKind = "anon-conversation";
  private traits: Record<string, unknown> = {};
  private rules: BootstrapResponse | null = null;
  private rulesLoaded = false;
  private rulesFailed = false;
  private sessionShown = new Set<string>();
  private localSuppression = new Set<string>();
  private pendingSurveys: string[] = [];
  private active: ActiveAsk | null = null;
  private initStarted = false;
  private bootstrapInflight: Promise<void> | null = null;
  private lastGoodRules: BootstrapResponse | null = null;
  private listeners = new Set<AgentControllerListener>();
  private deps: AgentControllerDeps;

  /** Default-open when not nonBlocking: task is open until resolveTask. */
  private taskOpen = true;
  private nonBlocking = false;
  /** Set true once resolveTask is used (or always when not nonBlocking). */
  private blockingCapable = true;
  private defaultSurveySlug: string | null = null;
  private turnCount = 0;
  private afterTurnTarget: number | null = null;
  private relativeTimeMs: number | null = null;
  private relativeTimer: ReturnType<typeof setTimeout> | null = null;
  private correlationSource: CorrelationSource = emptyCorrelationSource;
  /**
   * Server-provided bound tokens (surveyId -> binding). When present for the
   * survey about to show, the show-decision uses that token and correlation
   * (sessionId) so submit lands `linked`. Absent => unbound bootstrap path.
   */
  private boundTokens = new Map<string, BoundTokenBinding>();

  constructor(deps: AgentControllerDeps = {}) {
    this.deps = deps;
  }

  subscribe(listener: AgentControllerListener): () => void {
    this.listeners.add(listener);
    listener(this.active);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getActive(): ActiveAsk | null {
    return this.active;
  }

  isTaskOpen(): boolean {
    // Headless host predicate is authoritative when provided (fail-safe if it throws).
    if (this.deps.headlessMode && this.deps.headless) {
      try {
        if (this.deps.headless.isTaskOpen()) return true;
      } catch (err) {
        logError("headless isTaskOpen threw", err);
        return true; // fail-safe: treat as open (no show)
      }
    }
    if (this.nonBlocking) return false;
    return this.taskOpen;
  }

  /**
   * Install a correlation reader. Snapshot is taken at show-decision time
   * when no bound token is installed for the survey. Prefer bind() for the
   * production linked path (server-minted token + developer-provided ids).
   *
   * Observation-level scores are supported via developer-provided
   * traceId+observationId on bind/mint; only framework auto-READ is deferred
   * (NEEDS CEO VERIFICATION).
   */
  setCorrelationSource(source: CorrelationSource): void {
    this.correlationSource = source ?? emptyCorrelationSource;
  }

  /**
   * Install a server-minted bound show-token for a survey.
   *
   * Call after the host server runs mintFeedbackToken (secret-key path) and
   * threads the token + correlation ids to the client. When this survey is
   * shown, the bound token is used and submit carries the bound ids so the
   * response lands `linked`. Multiple surveys may each have one binding.
   *
   * Pass sessionId for a conversation (session-level) score; pass
   * traceId + observationId for a per-step observation score. Framework
   * auto-read of those ids remains deferred (developer-provided only).
   *
   * Without a bind for the survey, the unbound bootstrap token path still
   * works (stored `unlinked`).
   */
  bind(binding: BoundTokenBinding): void {
    if (!binding || typeof binding.surveyId !== "string" || binding.surveyId.length === 0) {
      logError("bind: missing surveyId");
      return;
    }
    if (typeof binding.showToken !== "string" || binding.showToken.length === 0) {
      logError("bind: missing showToken");
      return;
    }
    // Safety net (non-fatal): a token minted with a sessionId (always) or a
    // trace+observation binding must have that id threaded here, or the linked
    // submit 401s server-side. Warn if the binding carries no correlation id at
    // all - the likely developer mistake (forgot to thread sessionId into bind).
    const hasCorrelationId =
      (typeof binding.sessionId === "string" && binding.sessionId.length > 0) ||
      (typeof binding.observationId === "string" && binding.observationId.length > 0) ||
      (typeof binding.traceId === "string" && binding.traceId.length > 0);
    if (!hasCorrelationId) {
      logError(
        "bind: no correlation id (sessionId, or traceId+observationId). If the token was minted with one, thread it here or the linked submit will fail attestation (401).",
      );
    }
    this.boundTokens.set(binding.surveyId, {
      surveyId: binding.surveyId,
      showToken: binding.showToken,
      ...(typeof binding.sessionId === "string" && binding.sessionId.length > 0
        ? { sessionId: binding.sessionId }
        : {}),
      ...(typeof binding.observationId === "string" && binding.observationId.length > 0
        ? { observationId: binding.observationId }
        : {}),
      ...(typeof binding.traceId === "string" && binding.traceId.length > 0
        ? { traceId: binding.traceId }
        : {}),
      ...(typeof binding.taskType === "string" && binding.taskType.length > 0
        ? { taskType: binding.taskType }
        : {}),
    });
    log(
      "bind",
      binding.surveyId,
      "sessionId=",
      binding.sessionId,
      "traceId=",
      binding.traceId,
      "observationId=",
      binding.observationId,
    );
  }

  /** Clear a single survey binding, or all bindings when surveyId is omitted. */
  unbind(surveyId?: string): void {
    if (typeof surveyId === "string" && surveyId.length > 0) {
      this.boundTokens.delete(surveyId);
      return;
    }
    this.boundTokens.clear();
  }

  /** Bind or clear the headless host contract. */
  setHeadlessContract(contract: HeadlessContract | null): void {
    this.deps = { ...this.deps, headless: contract };
  }

  init(opts: AgentInitOptions): void {
    if (!opts || typeof opts.key !== "string" || opts.key.length === 0) {
      logError("init: missing key");
      return;
    }
    this.key = opts.key;
    if (typeof opts.apiBase === "string" && opts.apiBase.length > 0) {
      this.apiBase = opts.apiBase.replace(/\/$/, "");
    }
    this.debug = opts.debug === true;
    setDebug(this.debug);

    this.nonBlocking = opts.nonBlocking === true;
    // Blocking-capable by default (not nonBlocking). Task is default-open so
    // mixed-mode agents never fire mechanical triggers mid-task.
    this.blockingCapable = !this.nonBlocking;
    this.taskOpen = !this.nonBlocking;
    this.defaultSurveySlug =
      typeof opts.surveySlug === "string" && opts.surveySlug.length > 0
        ? opts.surveySlug
        : this.defaultSurveySlug;

    if (typeof opts.relativeTimeMs === "number" && opts.relativeTimeMs > 0) {
      this.relativeTimeMs = opts.relativeTimeMs;
    }

    // Ensure a respondent key exists so bootstrap can issue tokens (never-dark).
    this.ensureRespondentKey();

    if (this.initStarted) {
      log("init: already started, config updated");
      catchPromise(
        "init-rebootstrap",
        this.ensureBootstrap().then(() => this.afterRules()),
      );
      return;
    }
    this.initStarted = true;

    catchPromise(
      "init-bootstrap",
      this.ensureBootstrap().then(() => {
        this.afterRules();
        this.armRelativeTime();
      }),
    );
  }

  identify(opts: AgentIdentifyOptions = {}): void {
    if (opts && typeof opts.userId === "string" && opts.userId.length > 0) {
      this.userId = opts.userId;
      this.identityKind = "identified";
    } else {
      this.ensureRespondentKey();
    }
    if (opts?.traits && typeof opts.traits === "object") {
      this.traits = { ...this.traits, ...opts.traits };
    }
    log("identify", this.userId, this.identityKind, this.traits);

    if (!this.initStarted) return;

    catchPromise(
      "identify-bootstrap",
      this.ensureBootstrap({ force: true }).then(() => this.afterRules()),
    );
  }

  /**
   * Mark the current task resolved and run the onTaskResolved show-decision.
   * Makes the agent blocking-capable (default-open thereafter on next turn).
   *
   * When `defer: true` (deferAsk / off-platform async resolution): closes the
   * task so in-session asks are barred for this resolution, but does NOT
   * render InlineFeedback. Deliver the ask later via mintDeferredAskLink on
   * the customer's channel. UserVane does not send email/SMS.
   */
  resolveTask(opts: ResolveTaskOptions = {}): void {
    this.blockingCapable = true;
    this.taskOpen = false;
    log("resolveTask", opts.taskId, opts.outcome, opts.defer === true ? "defer" : "");

    if (opts.defer === true) {
      // Out-of-band: no in-session ask. Developer delivers later.
      log("resolveTask: deferAsk - in-session ask suppressed");
      return;
    }

    const slug =
      (typeof opts.surveySlug === "string" && opts.surveySlug.length > 0
        ? opts.surveySlug
        : null) ?? this.defaultSurveySlug;
    if (slug) {
      this.tryShowSlug(slug, "onTaskResolved");
    } else {
      log("resolveTask: no surveySlug configured; show deferred");
    }
  }

  /**
   * Alias for resolveTask({ defer: true, ... }). Out-of-band / async ask.
   */
  deferAsk(opts: Omit<ResolveTaskOptions, "defer"> = {}): void {
    this.resolveTask({ ...opts, defer: true });
  }

  /** Default survey slug from init (used by the agent tool and resolveTask). */
  getDefaultSurveySlug(): string | null {
    return this.defaultSurveySlug;
  }

  /**
   * True when at least one bound show-token attests issuer opt-in (amr).
   * The model cannot self-enable; only a server-minted allowModelRequested
   * token satisfies this.
   */
  allowsModelRequestedFeedback(surveyId?: string): boolean {
    if (typeof surveyId === "string" && surveyId.length > 0) {
      const bound = this.boundTokens.get(surveyId);
      return bound ? tokenAttestsModelRequested(bound.showToken) : false;
    }
    for (const bound of this.boundTokens.values()) {
      if (tokenAttestsModelRequested(bound.showToken)) return true;
    }
    return false;
  }

  /**
   * Trigger a model-requested ask for the survey slug (agent tool path).
   * Caller must have checked isTaskOpen and allowsModelRequestedFeedback.
   * Returns true when an ask became active.
   */
  requestModelFeedback(slug: string): boolean {
    if (typeof slug !== "string" || slug.length === 0) return false;
    if (this.isTaskOpen()) return false;
    this.tryShowSlug(slug, "modelRequested", { identityKind: "model-requested" });
    return this.active !== null && this.active.identityKind === "model-requested";
  }

  /**
   * Record a user turn. In blocking mode, re-opens the task after a prior
   * resolve so mechanical mid-task asks stay barred. In nonBlocking mode,
   * advances afterTurn(n) evaluation.
   */
  noteUserTurn(): void {
    this.turnCount += 1;
    if (this.blockingCapable && !this.nonBlocking) {
      this.taskOpen = true;
      log("noteUserTurn: task open", this.turnCount);
      return;
    }
    if (this.nonBlocking && this.afterTurnTarget !== null) {
      if (this.turnCount >= this.afterTurnTarget) {
        this.fireMechanical("afterTurn");
      }
    }
  }

  /**
   * Arm afterTurn(n). Only fires in nonBlocking mode (mechanical trigger).
   * Barred while a task is open (impossible in blocking mode by the state machine).
   */
  afterTurn(n: number): void {
    if (typeof n !== "number" || n < 1) {
      logError("afterTurn: n must be >= 1");
      return;
    }
    this.afterTurnTarget = n;
    log("afterTurn armed", n);
    if (this.nonBlocking && this.turnCount >= n) {
      this.fireMechanical("afterTurn");
    }
  }

  /** Session-end mechanical trigger. Only in nonBlocking mode. */
  onSessionEnd(): void {
    if (!this.nonBlocking) {
      log("onSessionEnd: ignored (blocking mode; use resolveTask)");
      return;
    }
    this.fireMechanical("onSessionEnd");
  }

  survey(slug: string): void {
    if (typeof slug !== "string" || slug.length === 0) {
      logError("survey: missing slug");
      return;
    }
    log("survey trigger", slug);

    if (!this.rulesLoaded) {
      if (!this.pendingSurveys.includes(slug)) {
        this.pendingSurveys.push(slug);
      }
      if (this.initStarted) {
        catchPromise(
          "survey-bootstrap",
          this.ensureBootstrap().then(() => this.afterRules()),
        );
      }
      return;
    }

    this.tryShowSlug(slug, "survey");
  }

  dismiss(): void {
    const current = this.active;
    if (!current) return;
    this.localSuppression.add(current.survey.id);
    this.sessionShown.add(current.survey.id);
    log("dismissed", current.survey.slug);
    this.setActive(null);
    if (this.deps.headless?.onDismiss) {
      try {
        this.deps.headless.onDismiss();
      } catch (err) {
        logError("headless onDismiss threw", err);
      }
    }
  }

  /**
   * Submit a response with the show-token, identity kind, and correlation
   * snapshotted at show time (never re-read here).
   */
  complete(result: CompleteOptions): void {
    const current = this.active;
    if (!current) return;

    this.localSuppression.add(current.survey.id);
    this.sessionShown.add(current.survey.id);

    const showToken = current.showToken;
    const survey = current.survey;
    const correlation = current.correlation;
    // Model-requested asks override the respondent identity kind at submit.
    const submitIdentityKind: IdentityKind = current.identityKind ?? this.identityKind;
    const respondentId = this.userId;

    if (!this.key || !respondentId) {
      logError("complete: missing key or respondent");
      this.setActive(null);
      return;
    }

    if (this.debug) {
      const linkedHint = hasAnyCorrelationId(correlation)
        ? "correlation-present-client"
        : unlinkReason(correlation);
      log("complete submit", survey.slug, "identityKind=", submitIdentityKind, linkedHint);
    }

    catchPromise(
      "submitResponse",
      (async () => {
        // Extra correlation / identity fields are additive on the ingest body.
        // Cast: @uservane/browser SubmitPayload is the base; edge accepts more.
        await submitResponse({
          apiBase: this.apiBase,
          key: this.key as string,
          payload: {
            surveyId: survey.id,
            rating: result.rating,
            text: result.text,
            followUpRequested: result.followUpRequested,
            showToken,
            userId: respondentId,
            traits: this.traits,
            sessionId: correlation.sessionId,
            observationId: correlation.observationId,
            traceId: correlation.traceId,
            taskType: correlation.taskType,
            identityKind: submitIdentityKind,
          } as Parameters<typeof submitResponse>[0]["payload"] & {
            sessionId?: string;
            observationId?: string;
            traceId?: string;
            taskType?: string;
            identityKind?: IdentityKind;
          },
          fetchImpl: this.deps.fetchImpl,
        });
      })(),
    );

    this.setActive(null);
  }

  /** Clear the active ask without submitting (after thanks, or host-driven hide). */
  hide(): void {
    if (!this.active) return;
    this.setActive(null);
  }

  getIdentityKind(): IdentityKind {
    return this.identityKind;
  }

  getRespondentId(): string | null {
    return this.userId;
  }

  /** Test hook: replace fetch implementation on a live controller. */
  setFetchImpl(fetchImpl: typeof fetch | undefined): void {
    this.deps = { ...this.deps, fetchImpl };
  }

  /** Inspect for tests. */
  getState() {
    return {
      key: this.key,
      apiBase: this.apiBase,
      debug: this.debug,
      userId: this.userId,
      identityKind: this.identityKind,
      traits: { ...this.traits },
      rules: this.rules,
      rulesLoaded: this.rulesLoaded,
      rulesFailed: this.rulesFailed,
      sessionShown: new Set(this.sessionShown),
      localSuppression: new Set(this.localSuppression),
      pendingSurveys: [...this.pendingSurveys],
      active: this.active,
      taskOpen: this.taskOpen,
      nonBlocking: this.nonBlocking,
      blockingCapable: this.blockingCapable,
      turnCount: this.turnCount,
      defaultSurveySlug: this.defaultSurveySlug,
      boundSurveyIds: [...this.boundTokens.keys()],
    };
  }

  resetForTests(): void {
    if (this.relativeTimer) {
      clearTimeout(this.relativeTimer);
      this.relativeTimer = null;
    }
    this.key = null;
    this.apiBase = DEFAULT_API_BASE;
    this.debug = false;
    setDebug(false);
    this.userId = null;
    this.identityKind = "anon-conversation";
    this.traits = {};
    this.rules = null;
    this.rulesLoaded = false;
    this.rulesFailed = false;
    this.sessionShown = new Set();
    this.localSuppression = new Set();
    this.pendingSurveys = [];
    this.active = null;
    this.initStarted = false;
    this.bootstrapInflight = null;
    this.lastGoodRules = null;
    this.taskOpen = true;
    this.nonBlocking = false;
    this.blockingCapable = true;
    this.defaultSurveySlug = null;
    this.turnCount = 0;
    this.afterTurnTarget = null;
    this.relativeTimeMs = null;
    this.correlationSource = emptyCorrelationSource;
    this.boundTokens.clear();
    this.notify();
  }

  private ensureRespondentKey(): void {
    if (this.userId) return;
    if (!this.key) return;
    const anon = resolveAnonymousKey(this.key);
    this.userId = anon.respondentId;
    this.identityKind = anon.identityKind;
    if (this.debug) {
      log("anonymous key", this.identityKind, this.userId);
    }
  }

  private armRelativeTime(): void {
    if (this.relativeTimer) {
      clearTimeout(this.relativeTimer);
      this.relativeTimer = null;
    }
    if (!this.nonBlocking || this.relativeTimeMs === null) return;
    const ms = this.relativeTimeMs;
    this.relativeTimer = setTimeout(() => {
      this.relativeTimer = null;
      this.fireMechanical("relativeTime");
    }, ms);
  }

  private fireMechanical(trigger: string): void {
    if (!this.nonBlocking) {
      log("mechanical barred: not nonBlocking", trigger);
      return;
    }
    if (this.isTaskOpen()) {
      log("mechanical barred: task open", trigger);
      return;
    }
    const slug = this.defaultSurveySlug;
    if (!slug) {
      log("mechanical: no surveySlug", trigger);
      return;
    }
    this.tryShowSlug(slug, trigger);
  }

  private setActive(next: ActiveAsk | null): void {
    this.active = next;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.active);
      } catch (err) {
        logError("listener error", err);
      }
    }
  }

  private async ensureBootstrap(opts: { force?: boolean } = {}): Promise<void> {
    if (!this.key) return;
    this.ensureRespondentKey();
    if (this.bootstrapInflight) {
      await this.bootstrapInflight;
      if (!opts.force) return;
    }

    const run = async () => {
      const result = await fetchBootstrap({
        apiBase: this.apiBase,
        key: this.key as string,
        userId: this.userId,
        traits: this.traits,
        fetchImpl: this.deps.fetchImpl,
      });

      if (result) {
        this.rules = result;
        this.lastGoodRules = result;
        this.rulesLoaded = true;
        this.rulesFailed = false;
        for (const id of result.suppression) {
          this.localSuppression.add(id);
        }
      } else if (this.lastGoodRules) {
        this.rules = this.lastGoodRules;
        this.rulesLoaded = true;
        this.rulesFailed = false;
        log("bootstrap: stale-serve cache");
      } else {
        this.rules = null;
        this.rulesLoaded = true;
        this.rulesFailed = true;
        logError("bootstrap failed; rendering nothing");
      }
    };

    this.bootstrapInflight = run().finally(() => {
      this.bootstrapInflight = null;
    });
    await this.bootstrapInflight;
  }

  private afterRules(): void {
    const pending = this.pendingSurveys.splice(0);
    for (const slug of pending) {
      this.tryShowSlug(slug, "pending");
    }
  }

  private tryShowSlug(
    slug: string,
    trigger: string,
    showOpts?: { identityKind?: IdentityKind },
  ): void {
    const survey = findSurveyBySlug(this.rules, slug);
    if (!survey) {
      log("survey not found", slug, trigger);
      return;
    }
    this.tryShowSurvey(survey, trigger, showOpts);
  }

  private tryShowSurvey(
    survey: SurveyDefinition,
    trigger: string,
    showOpts?: { identityKind?: IdentityKind },
  ): void {
    // Headless fail-safe: headless mode without contract refuses to show.
    if (this.deps.headlessMode && !this.deps.headless) {
      log("will not show: headless contract absent (isTaskOpen + onDismiss required)", survey.slug);
      return;
    }

    // Deciding constraint: never show while a task is open.
    if (this.isTaskOpen()) {
      log("will not show: task open", survey.slug, trigger);
      return;
    }

    if (this.active) {
      log("widget already active, skip", survey.slug);
      return;
    }

    // Model-requested path requires an amr-attesting bound token for this survey.
    if (showOpts?.identityKind === "model-requested") {
      const boundForAmr = this.boundTokens.get(survey.id);
      if (!boundForAmr || !tokenAttestsModelRequested(boundForAmr.showToken)) {
        log("will not show: model-requested without amr token", survey.slug);
        return;
      }
    }

    // Prefer server-provided bound token for this survey (production linked path).
    // Merge into rules so decideShow still applies suppression / sampling / targeting.
    const bound = this.boundTokens.get(survey.id);
    const rulesForShow =
      bound && this.rules
        ? {
            ...this.rules,
            showTokens: {
              ...(this.rules.showTokens ?? {}),
              [survey.id]: bound.showToken,
            },
          }
        : this.rules;

    const decision = decideShow(survey, {
      userId: this.userId,
      traits: this.traits,
      rules: rulesForShow,
      rulesLoaded: this.rulesLoaded,
      rulesFailed: this.rulesFailed,
      sessionShown: this.sessionShown,
      localSuppression: this.localSuppression,
    });

    if (!decision.show || !decision.showToken) {
      log("will not show", survey.slug, decision.reason, trigger);
      return;
    }

    // Bound path: correlation is the server-provided ids (explicit identity).
    // Unbound path: snapshot CorrelationSource at show time (default empty -> unlinked).
    let correlation: CorrelationSnapshot = {};
    if (bound) {
      correlation = {
        ...(bound.sessionId ? { sessionId: bound.sessionId } : {}),
        ...(bound.observationId ? { observationId: bound.observationId } : {}),
        ...(bound.traceId ? { traceId: bound.traceId } : {}),
        ...(bound.taskType ? { taskType: bound.taskType } : {}),
      };
    } else {
      try {
        correlation = this.correlationSource.capture() ?? {};
      } catch (err) {
        logError("correlationSource.capture threw; storing unlinked", err);
        correlation = {};
      }
    }

    // Bound token wins over bootstrap token when both exist.
    const showToken = bound?.showToken ?? decision.showToken;
    const askIdentityKind = showOpts?.identityKind;

    if (this.debug) {
      log(
        "show",
        survey.slug,
        trigger,
        "identityKind=",
        askIdentityKind ?? this.identityKind,
        "bound=",
        Boolean(bound),
        "correlation=",
        hasAnyCorrelationId(correlation) ? "present" : unlinkReason(correlation),
      );
    }

    this.sessionShown.add(survey.id);
    this.setActive({
      survey,
      showToken,
      correlation,
      ...(askIdentityKind ? { identityKind: askIdentityKind } : {}),
    });
  }
}
