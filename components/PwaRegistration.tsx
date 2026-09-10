"use client";

import { useEffect } from "react";
import { clearDevelopmentPwaState } from "@/lib/pwa-development";

export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      void clearDevelopmentPwaState({
        getRegistrations: "serviceWorker" in navigator
          ? () => navigator.serviceWorker.getRegistrations()
          : undefined,
        cacheStorage: "caches" in window ? window.caches : undefined,
      }).catch((error: unknown) => {
        console.error("Failed to clear the Reeve development cache:", error);
      });
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
      const scriptUrl = `/sw.js?v=${encodeURIComponent(appVersion)}`;

      void navigator.serviceWorker.register(scriptUrl, {
        scope: "/",
        updateViaCache: "none",
      }).catch((error: unknown) => {
        console.error("Failed to register the Reeve service worker:", error);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
