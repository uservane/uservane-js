/**
 * Core runtime: queued API, bootstrap, show-decision, widget mounting.
 * All deferred work is guarded so nothing escapes to the host.
 */

import { fetchBootstrap, submitResponse } from "./client.js";
import { log, logError, setDebug } from "./debug.js";
import { getDocument, isBrowser, onIdle } from "./env.js";
import { catchPromise, guard } from "./guard.js";
import { decideShow, findSurveyBySlug } from "./show-decision.js";
import { loadLocalSuppression, rememberSuppressed } from "./storage.js";
import {
  type BootstrapResponse,
  DEFAULT_API_BASE,
  DEFAULT_AUTO_DELAY_MS,
  type IdentifyOptions,
  type InitOptions,
  type SurveyDefinition,
} from "./types.js";
import { mountWidget, type WidgetHandle } from "./widget/widget.js";

type PendingSurvey = { slug: string };

export type RuntimeDeps = {
  fetchImpl?: typeof fetch;
  /** Test hook: replace idle scheduling. */
  scheduleIdle?: (fn: () => void) => () => void;
  /** Test hook: replace delay timers. */
  scheduleDelay?: (fn: () => void, ms: number) => () => void;
  /**
   * Test hooks that may throw. Used to prove async guards swallow errors.
   * Not part of the public product API.
   */
  testHooks?: {
    beforeAfterRules?: () => void;
    beforeTryShowSurvey?: () => void;
    beforeAutoShow?: () => void;
    beforeMount?: () => void;
    beforeSubmit?: () => void;
  };
};

export class Runtime {
  private key: string | null = null;
  private apiBase = DEFAULT_API_BASE;
  private debug = false;
  private userId: string | null = null;
  private traits: Record<string, unknown> = {};
  private rules: BootstrapResponse | null = null;
  private rulesLoaded = false;
  private rulesFailed = false;
  private sessionShown = new Set<string>();
  private localSuppression = new Set<string>();
  private pendingSurveys: PendingSurvey[] = [];
  private autoScheduled = new Set<string>();
  private activeWidget: WidgetHandle | null = null;
  private activeSurveyId: string | null = null;
  private initStarted = false;
  private bootstrapInflight: Promise<void> | null = null;
  private cancelIdle: (() => void) | null = null;
  private delayCancels: Array<() => void> = [];
  private deps: RuntimeDeps;
  /** Cached bootstrap body for stale-serve on subsequent identify. */
  private lastGoodRules: BootstrapResponse | null = null;

  constructor(deps: RuntimeDeps = {}) {
    this.deps = deps;
  }

  init(opts: InitOptions): void {
    if (!opts || typeof opts.key !== "string" || opts.key.length === 0) {
      logError("init: missing key");
      return;
    }
    // Idempotent: later init updates config but does not double-bootstrap.
    this.key = opts.key;
    if (typeof opts.apiBase === "string" && opts.apiBase.length > 0) {
      this.apiBase = opts.apiBase.replace(/\/$/, "");
    }
    this.debug = opts.debug === true;
    setDebug(this.debug);

    if (this.initStarted) {
      log("init: already started, config updated");
      // Re-bootstrap if we now have a key change or need refresh after identify.
      catchPromise(
        "init-rebootstrap",
        this.ensureBootstrap().then(() => this.afterRules()),
      );
      return;
    }
    this.initStarted = true;
    this.localSuppression = loadLocalSuppression();

    if (!isBrowser()) {
      log("init: non-browser, deferring work");
      return;
    }

    const schedule = this.deps.scheduleIdle ?? onIdle;
    this.cancelIdle = schedule(() => {
      // CRITICAL: terminal .catch so async throws never hit the host.
      catchPromise(
        "init-idle",
        this.ensureBootstrap().then(() => this.afterRules()),
      );
    });
  }

  identify(opts: IdentifyOptions): void {
    if (!opts || typeof opts.userId !== "string" || opts.userId.length === 0) {
      logError("identify: missing userId");
      return;
    }
    this.userId = opts.userId;
    if (opts.traits && typeof opts.traits === "object") {
      this.traits = { ...this.traits, ...opts.traits };
    }
    log("identify", this.userId, this.traits);

    if (!this.initStarted || !isBrowser()) return;

    // Traits update + re-bootstrap for server suppression + tokens.
    catchPromise(
      "identify-bootstrap",
      this.ensureBootstrap({ force: true }).then(() => this.afterRules()),
    );
  }

  survey(slug: string): void {
    if (typeof slug !== "string" || slug.length === 0) {
      logError("survey: missing slug");
      return;
    }
    log("survey trigger", slug);

    if (!this.rulesLoaded) {
      // Buffer until rules load. SPA auth often resolves after mount.
      if (!this.pendingSurveys.some((p) => p.slug === slug)) {
        this.pendingSurveys.push({ slug });
      }
      if (this.initStarted && isBrowser()) {
        catchPromise(
          "survey-bootstrap",
          this.ensureBootstrap().then(() => this.afterRules()),
        );
      }
      return;
    }

    // Explicit open (imperative survey()) - may move focus.
    this.tryShowSlug(slug, true);
  }

  /** Test/inspect helpers */
  getState() {
    return {
      key: this.key,
      apiBase: this.apiBase,
      debug: this.debug,
      userId: this.userId,
      traits: { ...this.traits },
      rules: this.rules,
      rulesLoaded: this.rulesLoaded,
      rulesFailed: this.rulesFailed,
      sessionShown: new Set(this.sessionShown),
      localSuppression: new Set(this.localSuppression),
      pendingSurveys: [...this.pendingSurveys],
      activeSurveyId: this.activeSurveyId,
    };
  }

  resetForTests(): void {
    this.cancelIdle?.();
    for (const c of this.delayCancels) c();
    this.delayCancels = [];
    this.activeWidget?.destroy();
    this.activeWidget = null;
    this.key = null;
    this.apiBase = DEFAULT_API_BASE;
    this.debug = false;
    setDebug(false);
    this.userId = null;
    this.traits = {};
    this.rules = null;
    this.rulesLoaded = false;
    this.rulesFailed = false;
    this.sessionShown = new Set();
    this.localSuppression = new Set();
    this.pendingSurveys = [];
    this.autoScheduled = new Set();
    this.activeSurveyId = null;
    this.initStarted = false;
    this.bootstrapInflight = null;
    this.lastGoodRules = null;
  }

  private async ensureBootstrap(opts: { force?: boolean } = {}): Promise<void> {
    if (!this.key) return;
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
        // Merge server suppression into local memory.
        for (const id of result.suppression) {
          this.localSuppression.add(id);
          rememberSuppressed(id);
        }
      } else if (this.lastGoodRules) {
        // Stale-serve last good cache.
        this.rules = this.lastGoodRules;
        this.rulesLoaded = true;
        this.rulesFailed = false;
        log("bootstrap: stale-serve cache");
      } else {
        // Fail closed: never a broken widget.
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
    guard("afterRules", () => {
      this.deps.testHooks?.beforeAfterRules?.();
      if (!this.rulesLoaded) return;

      // Drain buffered imperative triggers first (explicit open).
      const pending = this.pendingSurveys.splice(0);
      for (const p of pending) {
        this.tryShowSlug(p.slug, true);
      }

      // Schedule auto surveys (fixed delay after idle, once).
      if (this.rulesFailed || !this.rules) return;
      for (const survey of this.rules.surveys) {
        if (survey.trigger !== "auto") continue;
        if (this.autoScheduled.has(survey.id)) continue;
        this.autoScheduled.add(survey.id);
        const delay = survey.delayMs ?? DEFAULT_AUTO_DELAY_MS;
        this.scheduleAuto(survey, delay);
      }
    });
  }

  private scheduleAuto(survey: SurveyDefinition, delayMs: number): void {
    const schedule =
      this.deps.scheduleDelay ??
      ((fn: () => void, ms: number) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      });

    const cancel = schedule(() => {
      // Guard the timer body so a throw in auto mount cannot reach the host.
      guard("auto-show", () => {
        this.deps.testHooks?.beforeAutoShow?.();
        this.tryShowSurvey(survey, false);
      });
    }, delayMs);
    this.delayCancels.push(cancel);
  }

  private tryShowSlug(slug: string, explicitOpen: boolean): void {
    const survey = findSurveyBySlug(this.rules, slug);
    if (!survey) {
      log("survey not found", slug);
      return;
    }
    this.tryShowSurvey(survey, explicitOpen);
  }

  private tryShowSurvey(survey: SurveyDefinition, explicitOpen: boolean): void {
    guard("tryShowSurvey", () => {
      this.deps.testHooks?.beforeTryShowSurvey?.();
      if (!isBrowser() || !getDocument()) return;
      // Only one widget at a time.
      if (this.activeWidget) {
        log("widget already active, skip", survey.slug);
        return;
      }

      const decision = decideShow(survey, {
        userId: this.userId,
        traits: this.traits,
        rules: this.rules,
        rulesLoaded: this.rulesLoaded,
        rulesFailed: this.rulesFailed,
        sessionShown: this.sessionShown,
        localSuppression: this.localSuppression,
      });

      if (!decision.show || !decision.showToken) {
        log("will not show", survey.slug, decision.reason);
        return;
      }

      this.sessionShown.add(survey.id);
      this.activeSurveyId = survey.id;

      this.deps.testHooks?.beforeMount?.();

      const handle = mountWidget(
        survey,
        {
          onComplete: (result) => {
            this.handleComplete(survey, decision.showToken as string, result);
          },
          onDismiss: () => {
            this.handleDismiss(survey);
          },
          onClose: () => {
            if (this.activeWidget === handle) {
              this.activeWidget = null;
              this.activeSurveyId = null;
            }
          },
        },
        { moveFocus: explicitOpen },
      );

      if (!handle) {
        // Mount failed (no document / no inline slot). Fail closed.
        this.activeSurveyId = null;
        return;
      }
      this.activeWidget = handle;
    });
  }

  private handleComplete(
    survey: SurveyDefinition,
    showToken: string,
    result: { rating: number; text?: string; followUpRequested?: boolean },
  ): void {
    this.localSuppression.add(survey.id);
    rememberSuppressed(survey.id);

    if (!this.key) return;
    catchPromise(
      "submitResponse",
      (async () => {
        this.deps.testHooks?.beforeSubmit?.();
        await submitResponse({
          apiBase: this.apiBase,
          key: this.key as string,
          payload: {
            surveyId: survey.id,
            rating: result.rating,
            text: result.text,
            followUpRequested: result.followUpRequested,
            showToken,
            userId: this.userId ?? undefined,
            traits: this.traits,
          },
          fetchImpl: this.deps.fetchImpl,
        });
      })(),
    );
  }

  private handleDismiss(survey: SurveyDefinition): void {
    this.localSuppression.add(survey.id);
    rememberSuppressed(survey.id);
    log("dismissed", survey.slug);
  }
}
