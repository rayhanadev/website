import type { VercelConfig } from "@vercel/config/v1";

export const config = {
  framework: null,
  installCommand: "",
  buildCommand: "",
  outputDirectory: "public",
  cleanUrls: false,
  trailingSlash: false,
  redirects: [{ source: "/", destination: "/index.html", permanent: true }],
} satisfies VercelConfig;
