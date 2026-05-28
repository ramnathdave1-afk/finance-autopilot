/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@fa/ui"],
  experimental: {
    typedRoutes: false
  }
};

export default nextConfig;
