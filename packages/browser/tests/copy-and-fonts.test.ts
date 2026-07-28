import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allCopyValues, COPY } from "../src/copy.js";
import { hasWebFontReference, WIDGET_CSS } from "../src/widget/styles.js";

const EM_DASH = "\u2014";

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsFiles(p, acc);
    else if (/\.(ts|js|mjs|css)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe("copy and font rules", () => {
  it("no em-dash in any COPY string", () => {
    for (const v of allCopyValues()) {
      expect(v.includes(EM_DASH), `em-dash in: ${v}`).toBe(false);
    }
  });

  it("no em-dash in any source string of the package", () => {
    const srcRoot = join(import.meta.dirname, "../src");
    const files = walkTsFiles(srcRoot);
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      // Allow the character only if we are explicitly asserting against it.
      if (f.endsWith("copy.ts") && text.includes("U+2014")) {
        // the assertion comment may mention the codepoint name but not the glyph
      }
      expect(text.includes(EM_DASH), `em-dash in ${f}`).toBe(false);
    }
  });

  it("thanks copy is warm and short", () => {
    expect(COPY.thanks.length).toBeLessThan(80);
    expect(COPY.thanks.toLowerCase()).toContain("thank");
  });

  it("no web fonts in widget CSS", () => {
    expect(hasWebFontReference(WIDGET_CSS)).toBe(false);
    expect(WIDGET_CSS).not.toMatch(/@font-face/i);
    expect(WIDGET_CSS).not.toMatch(/fonts\.googleapis/i);
  });

  it("CSS uses inherit for font-family by default", () => {
    expect(WIDGET_CSS).toMatch(/--uv-font-family:\s*inherit/);
  });
});
