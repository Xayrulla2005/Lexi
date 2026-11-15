/** @type {import('next').NextConfig} */
const nextConfig = {
  // Linting runs once for the whole monorepo (`pnpm lint`), not inside `next build`.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
