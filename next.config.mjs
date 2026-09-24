/** @type {import('next').NextConfig} */
const nextConfig = {
  // AWS Amplify Hosting's SSR compute packages/runs the app from this
  // self-contained server bundle — without it, Route Handlers still execute
  // but don't reliably receive the app's configured runtime environment
  // variables (only build-time-inlined NEXT_PUBLIC_* values get through).
  output: "standalone",
};

export default nextConfig;
