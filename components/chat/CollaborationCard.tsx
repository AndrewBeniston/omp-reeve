"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  MessagesSquare,
  RadioTower,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { CollaborationSnapshot } from "@/lib/omp-types";
import { isCollaborationSnapshot } from "@/lib/collaboration-message";
import styles from "./collaboration-card.module.css";

export { isCollaborationSnapshot };

function qrPath(collaboration: CollaborationSnapshot): string {
  const rows = collaboration.qr?.rows ?? [];
  const modules: string[] = [];
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y] ?? "";
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === "1") modules.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return modules.join("");
}

function QrCode({ collaboration }: { collaboration: CollaborationSnapshot }) {
  const path = useMemo(() => qrPath(collaboration), [collaboration]);
  const qr = collaboration.qr;
  if (!qr) return null;
  const label = collaboration.mode === "view"
    ? "QR code for the view-only collaboration link"
    : "QR code for the writable collaboration link";
  return (
    <svg
      className={styles.qr}
      viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect className={styles.qrBackground} x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} />
      <path d={path} />
    </svg>
  );
}

export function CollaborationCard({ collaboration }: { collaboration: CollaborationSnapshot }) {
  const [copied, setCopied] = useState<"write" | "view" | null>(null);
  if (!collaboration.active) {
    return (
      <div className={styles.stopped}>
        <RadioTower aria-hidden="true" />
        <span>Collaboration stopped</span>
      </div>
    );
  }

  const primaryIsView = collaboration.mode === "view";
  const participantCount = collaboration.participants.length;
  const qrCaption = primaryIsView ? "Scan to watch" : "Scan to join";
  const copy = async (mode: "write" | "view", value?: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(mode);
  };

  return (
    <div className={styles.card} data-mode={collaboration.mode}>
      <div className={styles.hero}>
        <div className={styles.qrStage}>
          <QrCode collaboration={collaboration} />
          <span>{qrCaption}</span>
        </div>
        <div className={styles.overview}>
          <div className={styles.badges}>
            <span className={styles.liveBadge}>
              <span className={styles.liveDot} aria-hidden="true" />
              Live
            </span>
            <span className={styles.modeBadge}>{primaryIsView ? "View-only link" : "Writable link"}</span>
          </div>
          <div className={styles.title}>
            <RadioTower aria-hidden="true" />
            <h3>Live collaboration</h3>
          </div>
          <p className={styles.lead}>
            {primaryIsView
              ? "Anyone with this link can watch the session."
              : "Anyone with this link can steer the agent."}
          </p>
          <div className={styles.presence}>
            <div className={styles.avatars} aria-label="Collaboration participants">
              {collaboration.participants.slice(0, 4).map((participant, index) => (
                <span
                  key={`${participant.role}:${participant.name}:${index}`}
                  className={styles.avatar}
                  aria-label={`${participant.name}, ${participant.role}${participant.readOnly ? ", view-only" : ""}`}
                  title={participant.name}
                >
                  {participant.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
              ))}
            </div>
            <div className={styles.participants}>
              <Users aria-hidden="true" />
              <span>{participantCount} {participantCount === 1 ? "participant" : "participants"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.accessGrid}>
        <section className={styles.accessCard} data-primary={primaryIsView ? "false" : "true"}>
          <div className={styles.accessHeading}>
            <MessagesSquare aria-hidden="true" />
            <div>
              <strong>Writable access</strong>
              <span>Can view, prompt, and interrupt.</span>
            </div>
          </div>
          <div className={styles.actions}>
            <a href={collaboration.browserUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              Open collaboration
            </a>
            <button type="button" onClick={() => copy("write", collaboration.browserUrl)}>
              <Copy aria-hidden="true" />
              {copied === "write" ? "Copied" : "Copy link"}
            </button>
          </div>
        </section>
        <section className={styles.accessCard} data-primary={primaryIsView ? "true" : "false"}>
          <div className={styles.accessHeading}>
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>View-only access</strong>
              <span>Can watch this session.</span>
            </div>
          </div>
          <div className={styles.actions}>
            <a href={collaboration.viewBrowserUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              Open view-only
            </a>
            <button type="button" onClick={() => copy("view", collaboration.viewBrowserUrl)}>
              <Copy aria-hidden="true" />
              {copied === "view" ? "Copied" : "Copy view-only link"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
