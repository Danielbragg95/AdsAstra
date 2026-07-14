/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@signalwork/engine"],
  // native/runtime-only packages must not be bundled by webpack
  serverExternalPackages: ["@resvg/resvg-js", "satori"],
};
export default nextConfig;
