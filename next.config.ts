const nextConfig = {
  // Standalone output is used by the Docker image. Netlify's Next.js adapter
  // builds its own deployment output and does not need this mode.
  ...(process.env.NETLIFY === "true" ? {} : { output: "standalone" as const }),
};

export default nextConfig;
