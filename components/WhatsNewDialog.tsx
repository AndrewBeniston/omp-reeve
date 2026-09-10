"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { useI18n } from "@/hooks/useI18n";
import { openExternal } from "@/lib/open-external";
import { unseenReleases } from "@/lib/changelog";
import type { ChangelogRelease } from "@/lib/changelog";
import styles from "./shell/whats-new.module.css";

export const LAST_SEEN_VERSION_KEY = "omp-whats-new-seen-version";
const KOFI_URL = "https://ko-fi.com/andrewbeniston";
const REPO_URL = "https://github.com/AndrewBeniston/omp-reeve";

interface ChangelogResponse {
  version: string;
  releases: ChangelogRelease[];
}

export function readLastSeenVersion(storage: Pick<Storage, "getItem"> | null): string | null {
  try {
    return storage?.getItem(LAST_SEEN_VERSION_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Render backtick spans in changelog text as inline code. No other markdown is supported. */
export function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) =>
    part.startsWith("`") && part.endsWith("`")
      ? <code key={index} className={styles.code}>{part.slice(1, -1)}</code>
      : <span key={index}>{part}</span>,
  );
}

function HeartIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-6.7-4.3-9.2-8.4C.7 9 2.2 5 6 5c2.1 0 3.4 1.2 4 2.2h4c.6-1 1.9-2.2 4-2.2 3.8 0 5.3 4 3.2 7.6C18.7 16.7 12 21 12 21Z" transform="translate(0,0)" />
    </svg>
  );
}

interface WhatsNewViewProps {
  releases: ChangelogRelease[];
  showSupport: boolean;
  page: 0 | 1;
  onPage: (page: 0 | 1) => void;
  onDone: () => void;
}

export function WhatsNewView({ releases, showSupport, page, onPage, onDone }: WhatsNewViewProps) {
  const { t } = useI18n();
  const newest = releases[0];
  const lastPage = showSupport ? 1 : 0;

  return (
    <div className={styles.body} data-page={page}>
      {page === 0 ? (
        <div className={styles.releases}>
          {releases.map((release) => (
            <article key={release.version} className={styles.release}>
              <h3 className={styles.releaseTitle}>
                {t("whatsNew.version").replace("{version}", release.version)}
                {release.date ? <span className={styles.releaseDate}>{release.date}</span> : null}
              </h3>
              {release.sections.map((section) => (
                <section key={section.title} className={styles.section}>
                  <h4 className={styles.sectionTitle}>{section.title}</h4>
                  {section.items.map((item, index) =>
                    item.kind === "bullet"
                      ? null
                      : <p key={index} className={styles.paragraph}>{renderInline(item.text)}</p>,
                  )}
                  {section.items.some((item) => item.kind === "bullet") ? (
                    <ul className={styles.list}>
                      {section.items.filter((item) => item.kind === "bullet").map((item, index) => (
                        <li key={index}>{renderInline(item.text)}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.support}>
          <div className={styles.supportIcon}><HeartIcon /></div>
          <h3 className={styles.supportTitle}>{t("whatsNew.supportTitle")}</h3>
          <p className={styles.supportText}>{t("whatsNew.supportBody")}</p>
          <Button size="md" tone="primary" onClick={() => openExternal(KOFI_URL)}>{t("whatsNew.supportKofi")}</Button>
          <p className={styles.supportText}>{t("whatsNew.starBody")}</p>
          <Button size="md" tone="neutral" onClick={() => openExternal(REPO_URL)}>{t("whatsNew.starGithub")}</Button>
          <p className={styles.thanks}>{t("whatsNew.thanks")}</p>
        </div>
      )}
      <footer className={styles.footer}>
        <div>
          {page > 0 ? (
            <Button size="md" tone="ghost" onClick={() => onPage(0)}>{t("whatsNew.back")}</Button>
          ) : null}
        </div>
        {showSupport ? (
          <div className={styles.dots} aria-hidden="true">
            <span className={styles.dot} data-active={page === 0 || undefined} />
            <span className={styles.dot} data-active={page === 1 || undefined} />
          </div>
        ) : null}
        <div>
          {page < lastPage ? (
            <Button size="md" tone="primary" onClick={() => onPage(1)}>{t("whatsNew.continue")}</Button>
          ) : (
            <Button size="md" tone="primary" onClick={onDone}>{t("whatsNew.done")}</Button>
          )}
        </div>
      </footer>
      {newest ? null : <p className={styles.paragraph}>{t("whatsNew.empty")}</p>}
    </div>
  );
}

export function WhatsNewDialog() {
  const { t } = useI18n();
  const [data, setData] = useState<ChangelogResponse | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<0 | 1>(0);

  useEffect(() => {
    setLastSeen(readLastSeenVersion(typeof localStorage === "undefined" ? null : localStorage));
    let active = true;
    fetch("/api/changelog")
      .then((response) => (response.ok ? response.json() : null))
      .then((json: ChangelogResponse | null) => { if (active && json) setData(json); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const releases = useMemo(
    () => (data && lastSeen !== undefined ? unseenReleases(data.releases, data.version, lastSeen) : []),
    [data, lastSeen],
  );

  useEffect(() => {
    if (!data || lastSeen === undefined) return;
    if (lastSeen === data.version) return;
    if (releases.length === 0) {
      // Nothing to show for this version. Record it so a later version compares correctly.
      try { localStorage.setItem(LAST_SEEN_VERSION_KEY, data.version); } catch {}
      return;
    }
    setOpen(true);
  }, [data, lastSeen, releases]);

  const close = () => {
    setOpen(false);
    if (data) {
      try { localStorage.setItem(LAST_SEEN_VERSION_KEY, data.version); } catch {}
    }
  };

  if (!open || !data) return null;
  const showSupport = Boolean(releases[0]?.support);

  return (
    <Dialog
      open={open}
      size="md"
      title={t("whatsNew.title").replace("{version}", data.version)}
      className={styles.dialog}
      onOpenChange={(next) => { if (!next) close(); }}
    >
      <WhatsNewView releases={releases} showSupport={showSupport} page={page} onPage={setPage} onDone={close} />
    </Dialog>
  );
}
