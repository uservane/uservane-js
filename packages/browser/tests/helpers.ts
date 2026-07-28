import type { BootstrapResponse, SurveyDefinition } from "../src/types.js";

export function makeSurvey(overrides: Partial<SurveyDefinition> = {}): SurveyDefinition {
  return {
    id: "s_nps_1",
    slug: "nps-q1",
    type: "nps",
    question: "How likely are you to recommend us to a friend?",
    followUpQuestion: "What is the main reason for your score?",
    presentation: "corner",
    corner: "bottom-right",
    trigger: "manual",
    delayMs: 0,
    samplePercent: 100,
    showBadge: false,
    ...overrides,
  };
}

export function makeBootstrap(
  overrides: Partial<BootstrapResponse> & { survey?: Partial<SurveyDefinition> } = {},
): BootstrapResponse {
  const { survey: surveyOverrides, ...rest } = overrides;
  const survey = makeSurvey(surveyOverrides ?? {});
  return {
    surveys: rest.surveys ?? [survey],
    suppression: rest.suppression ?? [],
    showTokens: rest.showTokens ?? { [survey.id]: "tok_test_abc" },
  };
}

export type MockFetch = {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; init?: RequestInit }>;
  setBootstrap: (body: BootstrapResponse | null, status?: number) => void;
  setBootstrapError: () => void;
  setSubmitStatus: (status: number) => void;
  submittedBodies: unknown[];
};

export function createMockFetch(initial?: BootstrapResponse | null): MockFetch {
  let bootstrapBody: BootstrapResponse | null = initial ?? makeBootstrap();
  let bootstrapStatus = 200;
  let bootstrapThrow = false;
  let submitStatus = 200;
  const calls: MockFetch["calls"] = [];
  const submittedBodies: unknown[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });

    if (url.includes("/v1/sdk/bootstrap")) {
      if (bootstrapThrow) throw new Error("network down");
      if (bootstrapStatus >= 400 || bootstrapBody === null) {
        return new Response(JSON.stringify({ error: "fail" }), { status: bootstrapStatus || 500 });
      }
      return new Response(JSON.stringify(bootstrapBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/v1/sdk/responses")) {
      if (init?.body && typeof init.body === "string") {
        try {
          submittedBodies.push(JSON.parse(init.body));
        } catch {
          submittedBodies.push(init.body);
        }
      }
      return new Response(JSON.stringify({ ok: true }), { status: submitStatus });
    }

    return new Response("not found", { status: 404 });
  };

  return {
    fetchImpl,
    calls,
    submittedBodies,
    setBootstrap: (body, status = 200) => {
      bootstrapBody = body;
      bootstrapStatus = status;
      bootstrapThrow = false;
    },
    setBootstrapError: () => {
      bootstrapThrow = true;
    },
    setSubmitStatus: (status) => {
      submitStatus = status;
    },
  };
}

/** Flush microtasks + timers for happy-dom. */
export async function flush(ms = 0): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  if (ms > 0) {
    await new Promise<void>((r) => setTimeout(r, ms));
  }
  await Promise.resolve();
}

export function activeHost(): HTMLElement | null {
  return document.querySelector("[data-uservane-root]");
}

export function shadowRoot(): ShadowRoot | null {
  return activeHost()?.shadowRoot ?? null;
}

export function ratingButtons(): HTMLButtonElement[] {
  const root = shadowRoot();
  if (!root) return [];
  return [...root.querySelectorAll<HTMLButtonElement>(".rating")];
}
