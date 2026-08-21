import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "UserVane + Vercel AI example",
  description: "Resolve-time feedback with @uservane/vercel-ai",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b0f14",
          color: "#e8eef5",
          minHeight: "100vh",
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
