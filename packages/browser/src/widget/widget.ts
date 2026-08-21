/**
 * Widget lifecycle: hidden → entering → question → (follow-up) → submitting → thanks → exiting.
 * Shadow DOM. No focus trap. ESC dismisses. Rating alone is a complete response.
 * Every DOM event listener is internally guarded so throws never reach the host.
 */

import { COPY } from "../copy.js";
import { getDocument, prefersReducedMotion } from "../env.js";
import { guard, guardedListener } from "../guard.js";
import { isLowScoreFollowUp, scaleForType } from "../scale.js";
import { type SurveyDefinition, THANKS_AUTO_DISMISS_MS, type WidgetState } from "../types.js";
import { createRatingGroup, type RatingGroup } from "./rating.js";
import { INLINE_RESERVE_PX, WIDGET_CSS } from "./styles.js";

export type WidgetResult = {
  rating: number;
  text?: string;
  followUpRequested?: boolean;
  dismissed: boolean;
};

export type WidgetCallbacks = {
  /** Fired once when a rating is submitted (before thanks). */
  onComplete: (result: WidgetResult) => void;
  /** Fired once when dismissed without a submitted rating. */
  onDismiss: () => void;
  /** Fired when the widget is fully removed from the DOM. */
  onClose?: () => void;
};

export type MountWidgetOptions = {
  /**
   * Move focus into the rating row on open.
   * True only for explicit `UserVane.survey()` triggers, not auto appearance.
   */
  moveFocus?: boolean;
};

export type WidgetHandle = {
  destroy: () => void;
  getState: () => WidgetState;
  getHost: () => HTMLElement | null;
};

/**
 * Mount the survey widget. Returns null if the environment cannot host it
 * (no document, or inline presentation with no `[data-uservane]` slot).
 * Never throws to the host.
 */
export function mountWidget(
  survey: SurveyDefinition,
  callbacks: WidgetCallbacks,
  options: MountWidgetOptions = {},
): WidgetHandle | null {
  let handle: WidgetHandle | null = null;
  guard("mountWidget", () => {
    handle = mountWidgetInner(survey, callbacks, options);
  });
  return handle;
}

function mountWidgetInner(
  survey: SurveyDefinition,
  callbacks: WidgetCallbacks,
  options: MountWidgetOptions,
): WidgetHandle | null {
  const docMaybe = getDocument();
  if (!docMaybe) return null;
  const doc: Document = docMaybe;

  const isInline = survey.presentation === "inline";
  const isBanner = survey.presentation === "banner";
  const moveFocus = options.moveFocus === true;

  // W1: inline with no slot → render NOTHING (do not fall back to body).
  let mountTarget: HTMLElement;
  if (isInline) {
    const slot =
      doc.querySelector<HTMLElement>(`[data-uservane="${cssEscape(survey.slug)}"]`) ??
      doc.querySelector<HTMLElement>("[data-uservane]");
    if (!slot) {
      return null;
    }
    // W2: reserve real height so host content does not shift on mount.
    // Covers question + wrapped 44px rating rows + legend + follow-up block.
    if (!slot.style.minHeight) {
      slot.style.minHeight = `${INLINE_RESERVE_PX}px`;
    }
    mountTarget = slot;
  } else {
    mountTarget = doc.body;
  }

  const reduced = prefersReducedMotion();
  let state: WidgetState = "hidden";
  let rating: number | null = null;
  let followUpRequested: boolean | undefined;
  let destroyed = false;
  let completed = false;
  let thanksTimer: ReturnType<typeof setTimeout> | null = null;
  let enterTimer: ReturnType<typeof setTimeout> | null = null;
  let exitTimer: ReturnType<typeof setTimeout> | null = null;
  let ratingGroup: RatingGroup | null = null;

  const host = doc.createElement("div");
  host.setAttribute("data-uservane-root", survey.slug);
  /**
   * The mount element lives in the HOST page's light DOM, so the shadow root
   * protects what is inside it and nothing protects the element itself. A site
   * with a global rule like `div { border: 2px dashed; padding: 9px }` painted
   * it as a stray empty box in the page flow, which is a visible artifact on
   * somebody else's site.
   *
   * `display: contents` makes it generate no box at all, so there is nothing
   * for a host rule to paint or lay out, while inheritance still passes through
   * to the shadow content. Set as a priority declaration because the entire
   * point is to beat whatever the host page declares.
   */
  host.style.setProperty("display", "contents", "important");
  host.style.fontFamily = "inherit";

  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = WIDGET_CSS;
  shadow.appendChild(style);

  const live = doc.createElement("div");
  live.className = "live";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  shadow.appendChild(live);

  let surface: HTMLElement;

  if (isInline) {
    const inlineHost = doc.createElement("div");
    inlineHost.className = "inline-host";
    surface = doc.createElement("div");
    surface.className = "inline";
    inlineHost.appendChild(surface);
    shadow.appendChild(inlineHost);
  } else if (isBanner) {
    surface = doc.createElement("div");
    surface.className = "banner";
    surface.dataset.edge = "top";
    shadow.appendChild(surface);
  } else {
    surface = doc.createElement("div");
    surface.className = "card";
    surface.dataset.mode = "corner";
    surface.dataset.corner = survey.corner ?? "bottom-right";
    shadow.appendChild(surface);
  }

  surface.setAttribute("role", "dialog");
  surface.setAttribute("aria-modal", "false");
  surface.setAttribute("aria-label", survey.question);

  const header = doc.createElement("div");
  header.className = "header";

  const questionEl = doc.createElement("p");
  questionEl.className = "question";
  questionEl.id = `uv-q-${survey.id}`;
  questionEl.textContent = survey.question;
  surface.setAttribute("aria-labelledby", questionEl.id);

  const dismissBtn = doc.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.className = "dismiss";
  dismissBtn.setAttribute("aria-label", COPY.dismiss);
  dismissBtn.textContent = "×";
  dismissBtn.addEventListener(
    "click",
    guardedListener("dismiss-click", () => {
      dismiss();
    }),
  );

  header.append(questionEl, dismissBtn);
  surface.appendChild(header);

  const body = doc.createElement("div");
  body.className = "body";
  surface.appendChild(body);

  const scale = scaleForType(survey.type);
  const ratingOpts: Parameters<typeof createRatingGroup>[0] = {
    name: `uv-rating-${survey.id}`,
    reducedMotion: reduced,
    groupLabel: scale.groupLabel,
    onSelect: (value) => {
      onRating(value);
    },
  };
  if (scale.options && scale.options.length > 0) {
    ratingOpts.options = scale.options.map((o) => ({ value: o.value, label: o.label }));
  } else {
    ratingOpts.min = scale.min;
    ratingOpts.max = scale.max;
    ratingOpts.lowLabel = survey.endLabels?.low ?? scale.defaultEndLabels?.low ?? COPY.npsLow;
    ratingOpts.highLabel = survey.endLabels?.high ?? scale.defaultEndLabels?.high ?? COPY.npsHigh;
  }
  ratingGroup = createRatingGroup(ratingOpts);
  body.appendChild(ratingGroup.root);

  const followup = doc.createElement("div");
  followup.className = "followup";
  followup.hidden = true;

  const followLabel = doc.createElement("label");
  followLabel.htmlFor = `uv-fu-${survey.id}`;
  followLabel.textContent = survey.followUpQuestion ?? "Anything else you'd like to share?";

  const textarea = doc.createElement("textarea");
  textarea.id = `uv-fu-${survey.id}`;
  textarea.rows = 3;
  textarea.maxLength = 2000;
  textarea.addEventListener(
    "keydown",
    guardedListener("followup-keydown", (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    }),
  );
  textarea.addEventListener(
    "input",
    guardedListener("followup-input", () => {
      textarea.style.height = "auto";
      const max = 120;
      textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
    }),
  );

  const actions = doc.createElement("div");
  actions.className = "actions";

  const skipBtn = doc.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "btn btn-ghost";
  skipBtn.textContent = COPY.skip;
  skipBtn.addEventListener(
    "click",
    guardedListener("skip-click", () => {
      submit();
    }),
  );

  const sendBtn = doc.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "btn btn-primary";
  sendBtn.textContent = COPY.submit;
  sendBtn.addEventListener(
    "click",
    guardedListener("send-click", () => {
      submit();
    }),
  );

  actions.append(skipBtn, sendBtn);
  followup.append(followLabel, textarea, actions);

  const detractor = doc.createElement("div");
  detractor.className = "detractor";
  detractor.hidden = true;
  const detractorP = doc.createElement("p");
  detractorP.textContent = COPY.followUpOffer;
  const detActions = doc.createElement("div");
  detActions.className = "actions";
  const yesBtn = doc.createElement("button");
  yesBtn.type = "button";
  yesBtn.className = "btn btn-primary";
  yesBtn.textContent = COPY.followUpYes;
  yesBtn.addEventListener(
    "click",
    guardedListener("detractor-yes", () => {
      followUpRequested = true;
      submit();
    }),
  );
  const noBtn = doc.createElement("button");
  noBtn.type = "button";
  noBtn.className = "btn btn-ghost";
  noBtn.textContent = COPY.followUpNo;
  noBtn.addEventListener(
    "click",
    guardedListener("detractor-no", () => {
      followUpRequested = false;
      submit();
    }),
  );
  detActions.append(noBtn, yesBtn);
  detractor.append(detractorP, detActions);

  body.append(followup, detractor);

  if (survey.showBadge) {
    const badge = doc.createElement("a");
    badge.className = "badge";
    badge.href = COPY.poweredByUrl;
    badge.target = "_blank";
    badge.rel = "noopener noreferrer";
    badge.textContent = COPY.poweredBy;
    surface.appendChild(badge);
  }

  mountTarget.appendChild(host);

  const onKey = guardedListener("doc-keydown", (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (state === "thanks") {
      beginExit();
    } else if (state !== "exiting" && state !== "hidden" && state !== "submitting") {
      dismiss();
    }
  });
  doc.addEventListener("keydown", onKey);

  const onDocClick = guardedListener("doc-click-thanks", () => {
    if (state === "thanks") beginExit();
  });

  function announce(msg: string): void {
    live.textContent = "";
    requestAnimationFrame(() => {
      live.textContent = msg;
    });
  }

  function setState(next: WidgetState): void {
    state = next;
  }

  function enter(): void {
    setState("entering");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (destroyed) return;
        guard("enter-visible", () => {
          surface.classList.add("is-visible");
          setState("question");
          announce(COPY.liveRegionQuestion);
          // W3: focus only on explicit open (UserVane.survey), never auto.
          if (moveFocus) {
            ratingGroup?.focus();
          }
        });
      });
    });
  }

  function onRating(value: number): void {
    if (state !== "question" && state !== "follow-up") return;
    rating = value;
    ratingGroup?.collapse(value);

    const hasFollowUp = Boolean(survey.followUpQuestion);
    const wantsFollowUpPath = isLowScoreFollowUp(survey.type, value);

    if (hasFollowUp) {
      followup.hidden = false;
      const open = () => {
        if (destroyed) return;
        followup.classList.add("is-open");
        setState("follow-up");
        announce(COPY.liveRegionFollowUp);
        if (wantsFollowUpPath) {
          detractor.hidden = false;
        }
      };
      // N1: open in the same turn as collapse so total stays within 220ms
      // (collapse transition is 200ms; no extra open delay).
      if (reduced) open();
      else enterTimer = setTimeout(open, 0);
    } else if (wantsFollowUpPath) {
      setState("follow-up");
      detractor.hidden = false;
      announce(COPY.followUpOffer);
    } else {
      submit();
    }
  }

  function submit(): void {
    if (rating === null) return;
    if (completed) return;
    if (state === "thanks" || state === "exiting" || state === "submitting") return;
    setState("submitting");
    completed = true;

    const text = textarea.value.trim() || undefined;
    callbacks.onComplete({
      rating,
      text,
      followUpRequested,
      dismissed: false,
    });
    showThanks();
  }

  function showThanks(): void {
    setState("thanks");
    body.replaceChildren();
    header.replaceChildren();

    const thanks = doc.createElement("div");
    thanks.className = "thanks";
    const p = doc.createElement("p");
    p.textContent = COPY.thanks;
    thanks.appendChild(p);

    const close = doc.createElement("button");
    close.type = "button";
    close.className = "dismiss";
    close.setAttribute("aria-label", COPY.close);
    close.textContent = "×";
    close.addEventListener(
      "click",
      guardedListener("thanks-close", () => {
        beginExit();
      }),
    );
    header.appendChild(close);

    body.appendChild(thanks);
    announce(COPY.liveRegionThanks);

    // Defer so the triggering click does not immediately dismiss thanks.
    setTimeout(() => {
      if (!destroyed && state === "thanks") {
        doc.addEventListener("click", onDocClick, { once: true, capture: true });
      }
    }, 0);

    thanksTimer = setTimeout(() => beginExit(), THANKS_AUTO_DISMISS_MS);
  }

  function dismiss(): void {
    if (destroyed || completed) return;
    if (state === "exiting" || state === "hidden") return;
    clearTimers();
    setState("exiting");
    surface.classList.remove("is-visible");
    surface.classList.add("is-exiting");
    const ms = reduced ? 0 : 180;
    exitTimer = setTimeout(() => {
      guard("dismiss-complete", () => {
        callbacks.onDismiss();
        destroy();
      });
    }, ms);
  }

  function beginExit(): void {
    if (destroyed) return;
    if (state === "exiting" || state === "hidden") return;
    clearTimers();
    setState("exiting");
    surface.classList.remove("is-visible");
    surface.classList.add("is-exiting");
    const ms = reduced ? 0 : 180;
    exitTimer = setTimeout(() => {
      guard("exit-destroy", () => {
        destroy();
      });
    }, ms);
  }

  function clearTimers(): void {
    if (thanksTimer) clearTimeout(thanksTimer);
    if (enterTimer) clearTimeout(enterTimer);
    if (exitTimer) clearTimeout(exitTimer);
    thanksTimer = null;
    enterTimer = null;
    exitTimer = null;
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    clearTimers();
    doc.removeEventListener("keydown", onKey);
    doc.removeEventListener("click", onDocClick, true);
    ratingGroup?.destroy();
    ratingGroup = null;
    host.remove();
    setState("hidden");
    callbacks.onClose?.();
  }

  enter();

  return {
    destroy,
    getState: () => state,
    getHost: () => (destroyed ? null : host),
  };
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
