"use client";

import { WEB_THEME_VARIABLE_NAMES } from "@/lib/theme-contract";
import "./globals.css";
import "./tokens.css";

const themeBootstrap = `(function(){try{var r=document.documentElement,m=localStorage.getItem("omp-theme")==="dark"?"dark":"light",c=JSON.parse(localStorage.getItem("omp-theme-config")||"null"),p=c&&c.palettes&&c.palettes[m],v=${JSON.stringify(WEB_THEME_VARIABLE_NAMES)};r.dataset.ompThemeMode=m;if(p&&p.variables&&v.every(function(k){return typeof p.variables[k]==="string"})){v.forEach(function(k){r.style.setProperty(k,p.variables[k])});r.dataset.ompThemeName=p.name;r.style.colorScheme=p.colorScheme;r.classList.toggle("dark",p.colorScheme==="dark")}else{r.classList.toggle("dark",m==="dark")}}catch(e){}})();`;

const errorStyles = `
* { box-sizing: border-box; }
html#__next_error__,
html#__next_error__ body {
  width: 100%;
  min-height: 100%;
  margin: 0;
  background: var(--ui-main);
  color: var(--ui-text);
  font-family: var(--font-sans);
}
.error-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-main);
  color: var(--ui-text);
}
.error-card {
  width: min(100%, 381px);
  margin-top: -32px;
  padding: 32px 28px;
  text-align: left;
}
.error-icon {
  width: 32px;
  height: 32px;
  margin-bottom: 24px;
  color: var(--ui-text);
}
.error-title {
  margin: 0 0 12px;
  color: var(--ui-text);
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 32px;
}
.error-message {
  margin: 0 0 20px;
  color: var(--ui-text-muted);
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
}
.error-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.error-actions form { margin: 0; }
.error-button {
  min-width: 0;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--ui-composer-primary);
  border-radius: 6px;
  background: var(--ui-composer-primary);
  color: var(--ui-composer-primary-foreground);
  cursor: pointer;
  font: 500 14px/20px var(--font-sans);
}
.error-button:hover { opacity: 0.86; }
.error-button-secondary {
  border-color: var(--ui-border);
  background: transparent;
  color: var(--ui-text);
}
.error-button-secondary:hover {
  background: var(--ui-hover);
  opacity: 1;
}
.error-button:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}
.error-digest {
  position: fixed;
  right: 0;
  bottom: 32px;
  left: 0;
  margin: 0;
  color: var(--ui-text-dim);
  font: 400 12px/18px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  text-align: center;
}
`;

function WarningIcon() {
  return (
    <svg className="error-icon" viewBox="-0.2 -1.5 32 32" fill="none" aria-hidden="true">
      <path
        d="M16.9328 0C18.0839 0.0001 19.1334 0.6588 19.634 1.6953L31.4299 26.1309C32.0708 27.4588 31.1036 28.9999 29.6291 29H2.0022C0.5275 29 -0.4396 27.4588 0.2014 26.1309L11.9973 1.6953C12.4979 0.6588 13.5474 0.0001 14.6984 0H16.9328ZM3.5949 26H28.0363L16.9328 3H14.6984L3.5949 26ZM15.8156 19C16.9202 19 17.8156 19.8955 17.8156 21S16.9202 23 15.8156 23 13.8156 22.1046 13.8156 21 14.7111 19 15.8156 19ZM17.3156 16.5H14.3156V8.5H17.3156V16.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const isServerError = Boolean(error.digest);
  const message = isServerError
    ? "A server error occurred. Reload to try again."
    : "Reload to try again, or go back.";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: errorStyles }} />
      <main className="error-page">
        <section className="error-card" aria-labelledby="error-title">
          <WarningIcon />
          <h1 id="error-title" className="error-title">This page couldn’t load</h1>
          <p className="error-message">{message}</p>
          <div className="error-actions">
            <form>
              <button type="submit" className="error-button">Reload</button>
            </form>
            {!isServerError && (
              <button
                type="button"
                className="error-button error-button-secondary"
                onClick={() => {
                  if (window.history.length > 1) window.history.back();
                  else window.location.href = "/";
                }}
              >
                Back
              </button>
            )}
          </div>
        </section>
      </main>
      {error.digest && <p className="error-digest">ERROR {error.digest}</p>}
    </>
  );
}

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html id="__next_error__" lang="en" suppressHydrationWarning>
      <head>
        <title>Reeve could not load</title>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ErrorPage error={error} />
      </body>
    </html>
  );
}
