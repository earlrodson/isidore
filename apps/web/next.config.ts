import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/onboarding/**/*": ["../../packages/isidore-worker/resources/**/*"],
  },
};

export default nextConfig;
