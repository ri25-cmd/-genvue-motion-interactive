import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray package-lock.json in a
  // parent folder otherwise makes Next guess the wrong root.
  turbopack: {
    root: __dirname,
  },
  // Allow the iPad / iPhone / other devices on the local Wi-Fi to load the
  // dev-only resources (HMR, chunks). Without this, Next blocks cross-origin
  // requests to /_next/* and the page loads but never hydrates (dead UI).
  // Includes the current LAN IP plus common private subnets in case DHCP
  // hands out a different address at the venue.
  allowedDevOrigins: [
    "192.168.101.10",
    "192.168.101.*",
    "192.168.*.*",
    "10.0.0.*",
    "172.16.*.*",
  ],
};

export default nextConfig;
