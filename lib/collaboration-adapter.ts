import { CollabHost } from "@oh-my-pi/pi-coding-agent/collab/host";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import { QrCode } from "@oh-my-pi/pi-coding-agent/utils/qrcode";
import type {
  AgentSessionLike,
  CollaborationCommandResult,
  CollaborationParticipant,
  CollaborationQr,
  CollaborationSnapshot,
} from "./omp-types";

type CollaborationHostLike = Pick<
  CollabHost,
  "link" | "webLink" | "viewLink" | "webViewLink" | "participants" | "start" | "stop"
>;

type CollaborationAdapterOptions = {
  session: AgentSessionLike;
  eventBus?: unknown;
  createHost?: (context: InteractiveModeContext) => CollaborationHostLike;
  encodeQr?: (url: string) => CollaborationQr;
  onChange: (snapshot: CollaborationSnapshot) => void;
  onNotice: (message: string, type: "info" | "warning" | "error") => void;
  onQueueChange: () => void;
};

type CollaborationContext = Omit<InteractiveModeContext, "collabHost"> & {
  collabHost?: CollaborationHostLike;
};

function encodeQr(url: string): CollaborationQr {
  const qr = QrCode.encodeText(url, "M");
  const rows = Array.from({ length: qr.size }, (_, y) => (
    Array.from({ length: qr.size }, (_, x) => qr.module(x, y) ? "1" : "0").join("")
  ));
  return { size: qr.size, rows, url };
}

function normalizeRelayUrl(value: string): string {
  return value.includes("://") ? value : `wss://${value}`;
}

function isRelayArgument(value: string): boolean {
  return value.includes("://") || value.includes(".") || /^localhost(?::\d+)?$/i.test(value);
}

export class CollaborationAdapter {
  private readonly context: CollaborationContext;
  private readonly createHost: (context: InteractiveModeContext) => CollaborationHostLike;
  private readonly encodeQr: (url: string) => CollaborationQr;
  private mode: CollaborationSnapshot["mode"] = "write";

  constructor(private readonly options: CollaborationAdapterOptions) {
    this.createHost = options.createHost ?? ((context) => new CollabHost(context));
    this.encodeQr = options.encodeQr ?? encodeQr;
    const context = {
      session: options.session,
      sessionManager: options.session.sessionManager,
      settings: options.session.settings,
      eventBus: options.eventBus,
      subagentEventBus: options.eventBus,
      collabHost: undefined,
      showStatus: (message: string) => options.onNotice(message, "warning"),
      updatePendingMessagesDisplay: options.onQueueChange,
      ui: { requestRender: () => this.publish() },
      statusLine: {
        getCachedContextBreakdown: () => {
          const usage = options.session.getContextUsage();
          return {
            usedTokens: usage?.tokens ?? 0,
            contextWindow: usage?.contextWindow ?? 0,
          };
        },
        setCollabStatus: () => this.publish(),
        invalidate: () => this.publish(),
      },
    };
    this.context = context as unknown as CollaborationContext;
  }

  isActive(): boolean {
    return Boolean(this.context.collabHost);
  }

  snapshot(): CollaborationSnapshot {
    const host = this.context.collabHost;
    if (!host) return { active: false, mode: this.mode, participants: [] };
    const browserUrl = host.webLink;
    const viewBrowserUrl = host.webViewLink;
    const primaryUrl = this.mode === "view" ? viewBrowserUrl : browserUrl;
    return {
      active: true,
      mode: this.mode,
      browserUrl,
      viewBrowserUrl,
      terminalLink: host.link,
      viewTerminalLink: host.viewLink,
      participants: host.participants.map((participant) => ({
        name: participant.name,
        role: participant.role,
        ...(participant.readOnly ? { readOnly: true } : {}),
      } satisfies CollaborationParticipant)),
      qr: this.encodeQr(primaryUrl),
    };
  }

  async execute(argumentsText: string): Promise<CollaborationCommandResult> {
    const args = argumentsText.trim();
    const [candidate = "", ...restParts] = args.split(/\s+/);
    const verb = candidate.toLowerCase();
    const knownVerb = verb === "start" || verb === "view" || verb === "status" || verb === "stop";
    if (candidate && !knownVerb && !isRelayArgument(candidate)) {
      throw new Error("Usage: /collab [start|view|status|stop] [relayUrl]");
    }

    if (verb === "stop") return this.stop("host stopped");
    if (verb === "status") {
      return {
        message: this.isActive() ? "Collaboration session active" : "Collaboration is not active",
        collaboration: this.snapshot(),
      };
    }

    this.mode = verb === "view" ? "view" : "write";
    if (!this.context.collabHost) {
      const explicitRelay = knownVerb ? restParts.join(" ") : args;
      const settings = this.options.session.settings as unknown as { get: (key: string) => unknown };
      const configuredRelay = settings.get("collab.relayUrl");
      const relayInput = explicitRelay || (typeof configuredRelay === "string" ? configuredRelay : "");
      if (!relayInput) {
        throw new Error("No collaboration relay is configured");
      }
      const configuredWeb = settings.get("collab.webUrl");
      const webUrl = typeof configuredWeb === "string" ? configuredWeb : "";
      const host = this.createHost(this.context as unknown as InteractiveModeContext);
      this.context.collabHost = host;
      try {
        await host.start(normalizeRelayUrl(relayInput), webUrl);
      } catch (error) {
        this.context.collabHost = undefined;
        this.publish();
        throw error;
      }
    }

    const collaboration = this.snapshot();
    this.publish();
    return {
      message: "Collaboration session started",
      collaboration,
    };
  }

  async stop(reason: string): Promise<CollaborationCommandResult> {
    const host = this.context.collabHost;
    if (host) {
      await host.stop(reason);
      if (this.context.collabHost === host) this.context.collabHost = undefined;
      this.publish();
    }
    return {
      message: host ? "Collaboration stopped" : "Collaboration is not active",
      collaboration: this.snapshot(),
    };
  }

  private publish(): void {
    this.options.onChange(this.snapshot());
  }
}
