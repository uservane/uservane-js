import { describe, expect, it } from "vitest";
import type {
  BootstrapResponse,
  Corner,
  IdentifyOptions,
  InitOptions,
  Presentation,
  SurveyDefinition,
  SurveyType,
} from "../src/index.js";

/**
 * Compile-time re-export check: if these types are not re-exported from the
 * package entry, `tsc` fails. Runtime assertions keep the test from being empty.
 */
describe("public type re-exports", () => {
  it("re-exports InitOptions and IdentifyOptions shapes", () => {
    const init: InitOptions = { key: "uv_pk_type", apiBase: "https://x", debug: false };
    const id: IdentifyOptions = { userId: "u", traits: { plan: "free" } };
    expect(init.key).toBe("uv_pk_type");
    expect(id.userId).toBe("u");
  });

  it("re-exports survey and bootstrap types including multi-type SurveyType", () => {
    const corner: Corner = "bottom-right";
    const presentation: Presentation = "corner";
    const types: SurveyType[] = ["nps", "csat", "ces", "pmf"];
    const survey: SurveyDefinition = {
      id: "s1",
      slug: "nps",
      type: "nps",
      question: "How likely?",
      presentation,
      trigger: "manual",
      corner,
    };
    const csat: SurveyDefinition = {
      ...survey,
      id: "s2",
      slug: "csat",
      type: "csat",
      question: "How satisfied?",
    };
    const bootstrap: BootstrapResponse = {
      surveys: [survey, csat],
      suppression: [],
    };
    expect(bootstrap.surveys[0]?.slug).toBe("nps");
    expect(bootstrap.surveys[1]?.type).toBe("csat");
    expect(types).toHaveLength(4);
    expect(corner).toBe("bottom-right");
  });
});
