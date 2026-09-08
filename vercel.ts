import type { VercelConfig } from "@vercel/config/v1";

export const config = {
  framework: null,
  installCommand: "",
  buildCommand: "",
  outputDirectory: "public",
  cleanUrls: false,
  trailingSlash: false,
  redirects: [{ source: "/", destination: "/index.html", permanent: true }],
  headers: [
    {
      source: "/:page(.*\\.html)",
      headers: [{ key: "Cache-Control", value: "public, max-age=120, must-revalidate" }],
    },
    {
      // Asset filenames include a content hash so updates get a new cache entry.
      source: "/assets/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
  ],
} satisfies VercelConfig;
