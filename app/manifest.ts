import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Reeve",
    short_name: "Reeve",
    description: "Desktop workspace for the OMP coding agent",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#151820",
    theme_color: "#151820",
    categories: ["developer", "productivity"],
    lang: "en",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
