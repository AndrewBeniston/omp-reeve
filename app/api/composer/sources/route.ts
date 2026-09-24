import { NextResponse } from "next/server";
import { getAgentDir } from "@oh-my-pi/pi-coding-agent";
import { loadCapability } from "@oh-my-pi/pi-coding-agent/capability";
import type { MCPServer } from "@oh-my-pi/pi-coding-agent/capability/mcp";
import { discoverAgents } from "@oh-my-pi/pi-coding-agent/task";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { isApiRequestAllowed } from "@/lib/request-security";
import { readArchivedIds } from "@/lib/session-archive";
import { getRpcSessionInfos } from "@/lib/rpc-manager";
import { attachSessionProjectInfo, listAllSessions, mergeSessionLists } from "@/lib/session-reader";
import { readProjectBrowserTabs } from "@/lib/browser-tab-registry";
import { getProjectTrustStatus } from "@/lib/project-trust";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }

  const cwd = new URL(req.url).searchParams.get("cwd")?.trim() ?? "";
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  try {
    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const [persistedSessions, runtimeSessions, discoveredAgents, mcpCapability, trust] = await Promise.all([
      listAllSessions(),
      attachSessionProjectInfo(getRpcSessionInfos()),
      discoverAgents(cwd),
      loadCapability<MCPServer>("mcps", {
        cwd,
        includeDisabled: true,
        includeInvalid: false,
      }),
      Promise.resolve(getProjectTrustStatus(cwd, getAgentDir())),
    ]);
    const archived = readArchivedIds();
    const sessions = mergeSessionLists(persistedSessions, runtimeSessions)
      .filter((session) => !archived.has(session.id))
      .map((session) => ({
        id: session.id,
        label: session.name?.trim() || session.firstMessage.trim().slice(0, 120) || session.id,
        detail: session.name?.trim() ? session.firstMessage.trim() : "",
        modified: session.modified,
      }));
    const tabs = readProjectBrowserTabs(cwd).map((tab) => ({
      id: `browser:${tab.url}`,
      label: tab.url,
      detail: tab.url,
      kind: "browser",
    }));
    const agents = discoveredAgents.agents.map((agent) => ({
      name: agent.name,
      description: agent.description,
      source: agent.source,
    }));
    const mcpServers = mcpCapability.items
      .filter((server) => trust.trusted || server._source.level !== "project")
      .map((server) => ({
        name: server.name,
        enabled: server.enabled !== false,
        scope: server._source.level,
      }));

    return NextResponse.json({ sessions, tabs, agents, mcpServers }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
