import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * This example is standalone: it installs from npm rather than linking the
 * workspace, so pin the tracing root here. Without it Next walks up and picks
 * the monorepo's pnpm-lock.yaml as the workspace root.
 */
const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: here,
};

export default nextConfig;
