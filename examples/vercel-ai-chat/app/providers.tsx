"use client";

import { UserVaneProvider } from "@uservane/vercel-ai";
import type { ReactNode } from "react";

/**
 * Wraps the app in UserVaneProvider, which also renders the inline feedback ask
 * (renderInline defaults to true).
 *
 * When the publishable key is missing we render setup instructions INSTEAD of
 * the children. Rendering children without the provider would make useUserVane
 * throw, which is exactly what a fresh clone hits before any keys are set.
 */
export function Providers({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_USERVANE_KEY;

  if (!apiKey) {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "48px 20px" }}>
        <p style={{ margin: 0, color: "#7d8b99", fontSize: 13 }}>Example · @uservane/vercel-ai</p>
        <h1 style={{ fontSize: 22, margin: "8px 0 12px" }}>Set NEXT_PUBLIC_USERVANE_KEY</h1>
        <p style={{ color: "#9aa7b5", lineHeight: 1.6, fontSize: 15 }}>
          Copy <code>.env.example</code> to <code>.env.local</code> and set your UserVane
          publishable key, your secret key, and an OpenAI key. Then restart the dev server.
        </p>
        <pre
          style={{
            background: "#0f141b",
            border: "1px solid #243040",
            borderRadius: 10,
            padding: 16,
            fontSize: 13,
            overflowX: "auto",
            color: "#cfe0ff",
          }}
        >
          {"cp .env.example .env.local\n# edit .env.local\nnpm run dev"}
        </pre>
        <p style={{ color: "#6b7785", fontSize: 13, lineHeight: 1.6 }}>
          Keys come from your UserVane project settings. Create a free project at{" "}
          <a href="https://uservane.com" style={{ color: "#8eb6ff" }}>
            uservane.com
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <UserVaneProvider apiKey={apiKey} surveySlug="post-task">
      {children}
    </UserVaneProvider>
  );
}
