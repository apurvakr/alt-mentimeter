import os from "node:os";
import type { NextConfig } from "next";

// Phones join over the LAN IP, so the dev server has to accept those origins.
const lanHosts = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanHosts,
  // The dev badge sits on top of the presenter's Prev button.
  devIndicators: false,
};

export default nextConfig;
