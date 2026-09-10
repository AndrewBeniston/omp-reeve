import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/PwaRegistration";
import { WEB_THEME_VARIABLE_NAMES } from "@/lib/theme-contract";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./tokens.css";

export const metadata: Metadata = {
  title: "Reeve",
  description: "Desktop workspace for the OMP coding agent",
  applicationName: "Reeve",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Reeve",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // Matches --bg in app/globals.css: omp's `light` page surface and the
  // `titanium` brushed-titanium surface.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#151820" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <link
          rel="preload"
          href="/fonts/AutospawnSans-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/AutospawnSans-Medium.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=document.documentElement,m=localStorage.getItem("omp-theme")==="dark"?"dark":"light",c=JSON.parse(localStorage.getItem("omp-theme-config")||"null"),p=c&&c.palettes&&c.palettes[m],v=${JSON.stringify(WEB_THEME_VARIABLE_NAMES)};r.dataset.ompThemeMode=m;if(p&&p.variables&&v.every(function(k){return typeof p.variables[k]==="string"})){v.forEach(function(k){r.style.setProperty(k,p.variables[k])});r.dataset.ompThemeName=p.name;r.style.colorScheme=p.colorScheme;r.classList.toggle("dark",p.colorScheme==="dark")}else{r.classList.toggle("dark",m==="dark")}}catch(e){}})();`,
          }}
        />
      </head>
      <body translate="no" className="notranslate">
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
