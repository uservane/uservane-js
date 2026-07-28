/**
 * Shadow DOM styles. Two deliberate themes (light/dark). No web fonts.
 * Numbers are never color-coded by sentiment.
 */

/**
 * Reserved height for inline mounts: question + wrapped 44px rating rows
 * (0-5 / 6-10) + legend + follow-up block + padding. Must be large enough
 * that the slot does not grow on mount or when follow-up opens.
 */
export const INLINE_RESERVE_PX = 320;

export const WIDGET_CSS = /* css */ `
:host {
  --uv-font-family: inherit;
  --uv-font-size: 14px;
  --uv-radius: 12px;
  --uv-shadow: 0 8px 30px rgba(15, 15, 15, 0.12), 0 2px 8px rgba(15, 15, 15, 0.06);
  --uv-bg: #faf9f7;
  --uv-fg: #1c1b19;
  --uv-muted: #6b6860;
  --uv-accent: #2f5d50;
  --uv-accent-fg: #faf9f7;
  --uv-border: #e4e1da;
  --uv-backdrop-blur: 12px;
  --uv-target: 44px;
  --uv-ease: cubic-bezier(.2, .8, .2, 1);
  --uv-spring: cubic-bezier(.34, 1.4, .64, 1);
  all: initial;
  font-family: var(--uv-font-family, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: var(--uv-font-size);
  line-height: 1.45;
  color: var(--uv-fg);
  -webkit-font-smoothing: antialiased;
}

@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --uv-bg: #1a1a18;
    --uv-fg: #f2f0ea;
    --uv-muted: #a39e94;
    --uv-accent: #6fa893;
    --uv-accent-fg: #0f1412;
    --uv-border: #2e2d2a;
    --uv-shadow: 0 8px 30px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}

:host([data-theme="dark"]) {
  --uv-bg: #1a1a18;
  --uv-fg: #f2f0ea;
  --uv-muted: #a39e94;
  --uv-accent: #6fa893;
  --uv-accent-fg: #0f1412;
  --uv-border: #2e2d2a;
  --uv-shadow: 0 8px 30px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3);
}

:host([data-theme="light"]) {
  --uv-bg: #faf9f7;
  --uv-fg: #1c1b19;
  --uv-muted: #6b6860;
  --uv-accent: #2f5d50;
  --uv-accent-fg: #faf9f7;
  --uv-border: #e4e1da;
  --uv-shadow: 0 8px 30px rgba(15, 15, 15, 0.12), 0 2px 8px rgba(15, 15, 15, 0.06);
}

*, *::before, *::after { box-sizing: border-box; }

.root {
  font-family: inherit;
  color: var(--uv-fg);
}

/* Corner card: fixed, never reflows host */
.card {
  position: fixed;
  z-index: 2147483000;
  width: min(360px, calc(100vw - 32px));
  max-width: 360px;
  background: var(--uv-bg);
  color: var(--uv-fg);
  border: 1px solid var(--uv-border);
  border-radius: var(--uv-radius);
  box-shadow: var(--uv-shadow);
  backdrop-filter: blur(var(--uv-backdrop-blur));
  padding: 16px 16px 14px;
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
}

.card[data-corner="bottom-right"] { right: 16px; bottom: 16px; }
.card[data-corner="bottom-left"] { left: 16px; bottom: 16px; }
.card[data-corner="top-right"] { right: 16px; top: 16px; }
.card[data-corner="top-left"] { left: 16px; top: 16px; }

.card.is-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
  transition: opacity 240ms var(--uv-ease), transform 240ms var(--uv-ease);
}

.card.is-exiting {
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 180ms var(--uv-ease), transform 180ms var(--uv-ease);
}

@media (max-width: 479px) {
  .card[data-mode="corner"] {
    left: 16px;
    right: 16px;
    bottom: 16px;
    top: auto;
    width: auto;
    max-width: none;
    border-radius: var(--uv-radius) var(--uv-radius) 10px 10px;
  }
}

/* Banner: fixed full-width */
.banner {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 2147483000;
  background: var(--uv-bg);
  color: var(--uv-fg);
  border-bottom: 1px solid var(--uv-border);
  box-shadow: var(--uv-shadow);
  padding: 10px 16px;
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
}
.banner[data-edge="bottom"] {
  bottom: 0;
  top: auto;
  border-bottom: none;
  border-top: 1px solid var(--uv-border);
  transform: translateY(4px);
}
.banner.is-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
  transition: opacity 240ms var(--uv-ease), transform 240ms var(--uv-ease);
}
.banner.is-exiting {
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms var(--uv-ease), transform 180ms var(--uv-ease);
}

/* Inline: reserves full card height so CLS stays 0 (see INLINE_RESERVE_PX) */
.inline-host {
  display: block;
  min-height: 320px;
  width: 100%;
}
.inline {
  width: 100%;
  background: var(--uv-bg);
  color: var(--uv-fg);
  border: 1px solid var(--uv-border);
  border-radius: var(--uv-radius);
  padding: 16px;
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
}
.inline.is-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
  transition: opacity 240ms var(--uv-ease), transform 240ms var(--uv-ease);
}
.inline.is-exiting {
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 180ms var(--uv-ease), transform 180ms var(--uv-ease);
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.question {
  margin: 0;
  font-size: 1em;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.4;
  flex: 1;
}

.dismiss {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--uv-muted);
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  flex: none;
  padding: 0;
}
.dismiss:hover { color: var(--uv-fg); background: color-mix(in srgb, var(--uv-fg) 6%, transparent); }
.dismiss:focus-visible { outline: 2px solid var(--uv-accent); outline-offset: 2px; }

/* Signature rating row (NPS/CSAT/CES numeric; PMF option list) */
.scale-wrap {
  position: relative;
}
.scale {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: space-between;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.scale.scale-options {
  flex-direction: column;
  justify-content: flex-start;
  gap: 6px;
}
.scale-legend {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-size: 0.75em;
  color: var(--uv-muted);
}
.scale-legend span { max-width: 48%; }

.rating {
  appearance: none;
  border: 1px solid var(--uv-border);
  background: transparent;
  color: var(--uv-fg);
  width: var(--uv-target);
  height: var(--uv-target);
  min-width: var(--uv-target);
  min-height: var(--uv-target);
  border-radius: 10px;
  font: inherit;
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 120ms var(--uv-ease), border-color 120ms var(--uv-ease),
    background 120ms var(--uv-ease), color 120ms var(--uv-ease), box-shadow 120ms var(--uv-ease);
  /* Neutral until interacted - never sentiment-colored */
  flex: 0 0 auto;
}
.rating.rating-option {
  width: 100%;
  height: auto;
  min-height: var(--uv-target);
  padding: 0.55rem 0.75rem;
  justify-content: flex-start;
  text-align: left;
  line-height: 1.3;
}
.rating:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--uv-accent) 55%, var(--uv-border));
}
.rating:focus-visible {
  outline: 2px solid var(--uv-accent);
  outline-offset: 2px;
}
.rating[aria-checked="true"],
.rating.is-selected {
  background: var(--uv-accent);
  color: var(--uv-accent-fg);
  border-color: var(--uv-accent);
}

/* Collapse: only chosen value remains; follow-up rises into place < 220ms */
.scale-wrap.is-collapsed .rating:not(.is-selected) {
  width: 0;
  min-width: 0;
  height: 0;
  min-height: 0;
  opacity: 0;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  pointer-events: none;
  transform: scale(0.6);
  transition: width 200ms var(--uv-spring), min-width 200ms var(--uv-spring),
    height 200ms var(--uv-spring), min-height 200ms var(--uv-spring),
    opacity 160ms var(--uv-ease), transform 200ms var(--uv-spring),
    margin 200ms var(--uv-spring), border 0s;
}
.scale-wrap.is-collapsed .rating.rating-option.is-selected {
  width: 100%;
}
.scale-wrap.is-collapsed .scale {
  justify-content: flex-start;
}
.scale-wrap.is-collapsed .scale-legend {
  opacity: 0;
  height: 0;
  margin: 0;
  overflow: hidden;
  transition: opacity 120ms var(--uv-ease), height 200ms var(--uv-spring);
}

.followup {
  margin-top: 0;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transform: translateY(6px);
  transition: max-height 200ms var(--uv-spring), opacity 180ms var(--uv-ease),
    transform 200ms var(--uv-spring), margin 200ms var(--uv-spring);
}
.followup.is-open {
  margin-top: 12px;
  max-height: 280px;
  opacity: 1;
  transform: translateY(0);
}

.followup label {
  display: block;
  font-size: 0.9em;
  color: var(--uv-muted);
  margin-bottom: 6px;
}

.followup textarea {
  width: 100%;
  min-height: 64px;
  max-height: 120px;
  resize: vertical;
  font: inherit;
  color: var(--uv-fg);
  background: color-mix(in srgb, var(--uv-fg) 3%, var(--uv-bg));
  border: 1px solid var(--uv-border);
  border-radius: 8px;
  padding: 8px 10px;
  line-height: 1.4;
}
.followup textarea:focus-visible {
  outline: 2px solid var(--uv-accent);
  outline-offset: 1px;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
  flex-wrap: wrap;
}

.btn {
  appearance: none;
  border: 1px solid var(--uv-border);
  background: transparent;
  color: var(--uv-fg);
  font: inherit;
  font-size: 0.9em;
  font-weight: 500;
  padding: 8px 12px;
  min-height: 36px;
  border-radius: 8px;
  cursor: pointer;
}
.btn:hover { border-color: color-mix(in srgb, var(--uv-accent) 40%, var(--uv-border)); }
.btn:focus-visible { outline: 2px solid var(--uv-accent); outline-offset: 2px; }
.btn-primary {
  background: var(--uv-accent);
  color: var(--uv-accent-fg);
  border-color: var(--uv-accent);
}
.btn-ghost {
  border-color: transparent;
  color: var(--uv-muted);
}

.detractor {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--uv-border);
}
.detractor p {
  margin: 0 0 8px;
  font-size: 0.9em;
  color: var(--uv-muted);
}
.detractor .actions { margin-top: 0; }

.thanks {
  text-align: left;
  padding: 4px 0;
}
.thanks p {
  margin: 0;
  font-size: 1em;
  font-weight: 500;
  line-height: 1.45;
}

.badge {
  display: inline-block;
  margin-top: 10px;
  font-size: 0.7em;
  color: var(--uv-muted);
  text-decoration: none;
}
.badge:hover { color: var(--uv-fg); }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .card, .banner, .inline,
  .card.is-visible, .banner.is-visible, .inline.is-visible,
  .card.is-exiting, .banner.is-exiting, .inline.is-exiting,
  .rating, .scale-wrap.is-collapsed .rating:not(.is-selected),
  .scale-wrap.is-collapsed .scale-legend,
  .followup, .followup.is-open {
    transition: none !important;
    animation: none !important;
  }
  .card.is-visible, .banner.is-visible, .inline.is-visible {
    opacity: 1;
    transform: none;
  }
  .card.is-exiting, .banner.is-exiting, .inline.is-exiting {
    opacity: 0;
    transform: none;
  }
  .followup.is-open {
    transform: none;
  }
}
`;

/** Exported for the no-web-font assertion test. */
export function hasWebFontReference(css: string): boolean {
  return (
    /@font-face/i.test(css) ||
    /fonts\.googleapis/i.test(css) ||
    /fonts\.gstatic/i.test(css) ||
    /typekit\.net/i.test(css) ||
    /use\.typekit/i.test(css)
  );
}
