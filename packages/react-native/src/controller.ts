/**
 * Platform-agnostic survey controller for React Native.
 * Reuses @uservane/browser client + show-decision + sampling. No DOM.
 * Server-authoritative suppression via bootstrap; local Set is a session backup.
 */

import {
  type BootstrapResponse,
  catchPromise,
  DEFAULT_API_BASE,
  decideShow,
  fetchBootstrap,
  findSurveyBySlug,
  type IdentifyOptions,
  type InitOptions,
  log,
  logError,
  type SurveyDefinition,
  setDebug,
  submitResponse,
} from "@uservane/browser";
import type { ActiveSurvey, SurveyCompleteResult } from "./types.js";

export type ControllerListener = (active: ActiveSurvey | null) => void;

export type ControllerDeps = {
  fetchImpl?: typeof fetch;
};

export class NativeController {
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
  private pendingSurveys: string[] = [];
  private active: ActiveSurvey | null = null;
  private initStarted = false;
  private bootstrapInflight: Promise<void> | null = null;
  private lastGoodRules: BootstrapResponse | null = null;
  private listeners = new Set<ControllerListener>();
  private deps: ControllerDeps;

  constructor(deps: ControllerDeps = {}) {
    this.deps = deps;
  }

  subscribe(listener: ControllerListener): () => void {
    this.listeners.add(listener);
    listener(this.active);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getActive(): ActiveSurvey | null {
    return this.active;
  }

  init(opts: InitOptions): void {
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
      this.ensureBootstrap().then(() => this.afterRules()),
    );
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

    if (!this.initStarted) return;

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

    this.tryShowSlug(slug);
  }

  dismiss(): void {
    const current = this.active;
    if (!current) return;
    this.localSuppression.add(current.survey.id);
    this.sessionShown.add(current.survey.id);
    log("dismissed", current.survey.slug);
    this.setActive(null);
  }

  /**
   * Submit a response with the server show-token and suppress re-prompt.
   * Keeps the active survey mounted so the card can show honest thanks;
   * call `hide()` after the thanks auto-dismiss.
   */
  complete(result: SurveyCompleteResult): void {
    const current = this.active;
    if (!current) return;

    this.localSuppression.add(current.survey.id);
    this.sessionShown.add(current.survey.id);

    const showToken = current.showToken;
    const survey = current.survey;

    if (!this.key) return;

    catchPromise(
      "submitResponse",
      (async () => {
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

  /** Clear the active survey (after thanks, or host-driven hide). */
  hide(): void {
    if (!this.active) return;
    this.setActive(null);
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
      traits: { ...this.traits },
      rules: this.rules,
      rulesLoaded: this.rulesLoaded,
      rulesFailed: this.rulesFailed,
      sessionShown: new Set(this.sessionShown),
      localSuppression: new Set(this.localSuppression),
      pendingSurveys: [...this.pendingSurveys],
      active: this.active,
    };
  }

  resetForTests(): void {
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
    this.active = null;
    this.initStarted = false;
    this.bootstrapInflight = null;
    this.lastGoodRules = null;
    this.notify();
  }

  private setActive(next: ActiveSurvey | null): void {
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
      this.tryShowSlug(slug);
    }
  }

  private tryShowSlug(slug: string): void {
    const survey = findSurveyBySlug(this.rules, slug);
    if (!survey) {
      log("survey not found", slug);
      return;
    }
    this.tryShowSurvey(survey);
  }

  private tryShowSurvey(survey: SurveyDefinition): void {
    if (this.active) {
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
    this.setActive({ survey, showToken: decision.showToken });
  }
}
