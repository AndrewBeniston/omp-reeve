import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

import { DomEvent, React, mount } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { getRejectedPromptRecovery, useAgentSession } = await jiti.import("./useAgentSession.ts");

const h = React.createElement;

const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const appShellSource = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
const modelsRouteSource = await readFile(new URL("../app/api/models/route.ts", import.meta.url), "utf8");
const sessionReaderSource = await readFile(new URL("../lib/session-reader.ts", import.meta.url), "utf8");
const englishMessages = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const chineseMessages = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");

test("keeps the session event stream open through the idle grace window", () => {
  const finishSource = source.slice(
    source.indexOf("const finishPromptWithoutStream"),
    source.indexOf("const waitForPromptSettlement"),
  );
  const graceSource = source.slice(
    source.indexOf("const scheduleEventStreamClose"),
    source.indexOf("const finishPromptWithoutStream"),
  );
  const agentEndSource = source.slice(
    source.indexOf('case "agent_end"'),
    source.indexOf('case "agent_settled"'),
  );
  const agentStartSource = source.slice(
    source.indexOf('case "agent_start"'),
    source.indexOf('case "agent_end"'),
  );
  const agentSettledSource = source.slice(
    source.indexOf('case "agent_settled"'),
    source.indexOf('case "prompt_done"'),
  );
  const promptDoneSource = source.slice(
    source.indexOf('case "prompt_done"'),
    source.indexOf('case "prompt_error"'),
  );
  const sendSource = source.slice(
    source.indexOf("  const handleSend = useCallback"),
    source.indexOf("  const executeBash = useCallback"),
  );

  assert.match(source, /const EVENT_STREAM_IDLE_GRACE_MS = 30_000/);
  assert.match(graceSource, /setTimeout\(\(\) => void checkServerIdle\(\), EVENT_STREAM_IDLE_GRACE_MS\)/);
  assert.match(graceSource, /fetch\(`\/api\/agent\/\$\{encodeURIComponent\(sid\)\}`\)/);
  assert.match(graceSource, /closeEvents\(\)/);
  assert.match(finishSource, /scheduleEventStreamClose\(sid\)/);
  assert.doesNotMatch(finishSource, /closeEvents\(\)/);
  assert.doesNotMatch(agentEndSource, /closeEvents\(\)/);
  assert.match(agentStartSource, /cancelEventStreamGrace\(\)/);
  assert.match(agentSettledSource, /scheduleEventStreamClose\(sid\)/);
  assert.match(agentSettledSource, /onAgentEnd\?\.\(\)/);
  assert.match(promptDoneSource, /notifyPromptStage\(runId\)/);
  assert.match(promptDoneSource, /scheduleEventStreamClose\(sid\)/);
  assert.match(sendSource, /const definitivelyRejected = !promptRequestStarted \|\| isPromptRejectedError\(e\)/);
  assert.match(sendSource, /if \(!definitivelyRejected && sentSessionId\) \{[\s\S]*?waitForPromptSettlement/);
  assert.match(sendSource, /if \(!definitivelyRejected && sentSessionId\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?closeEvents\(\)/);
});

test("publishes generated Session titles through the active Session path", () => {
  const titleSource = source.slice(
    source.indexOf('case "session_name_changed"'),
    source.indexOf('case "prompt_error"'),
  );

  assert.match(source, /onSessionNameChanged\?: \(sessionId: string, name: string\) => void/);
  assert.match(titleSource, /onSessionNameChanged\?\.\(sid, name\)/);
  assert.match(chatWindowSource, /onSessionNameChanged/);
  assert.match(appShellSource, /const handleSessionNameChanged = useCallback/);
  assert.match(appShellSource, /onSessionNameChanged=\{handleSessionNameChanged\}/);
});

test("restores a rejected prompt through the current composer handle", () => {
  const sendSource = source.slice(
    source.indexOf("  const handleSend = useCallback"),
    source.indexOf("  const executeBash = useCallback"),
  );

  assert.match(source, /modelsRefreshKey, chatInputRef, onBranchDataChange/);
  assert.match(sendSource, /chatInputRef\?\.current\?\.restoreSubmission\?\.\(/);
  assert.match(sendSource, /getRejectedPromptRecovery\(message, images, session\?\.id, sentSessionId, newSessionPromotedRef\.current\)/);
  assert.match(sendSource, /recovery\.text,\s*recovery\.images,\s*recovery\.targetDraftKey/);
  assert.match(sendSource, /chatInputRef, closeEvents/);
  assert.doesNotMatch(sendSource, /opts\.chatInputRef/);
});

test("wires the Composer Speed control to the session fast mode", () => {
  const fastModeSource = source.slice(
    source.indexOf("  const handleFastModeChange = useCallback"),
    source.indexOf("  const handleToolPresetChange = useCallback"),
  );

  assert.match(source, /const \[fastModeEnabled, setFastModeEnabled\] = useState\(false\)/);
  assert.match(source, /liveState\.fastModeEnabled !== undefined[\s\S]*?setFastModeEnabled/);
  assert.match(fastModeSource, /type: "set_fast_mode",[\s\S]*?enabled/);
  assert.match(fastModeSource, /setFastModeEnabled\(result\.enabled\)/);
  assert.match(source, /fastModeEnabled,[\s\S]*?handleFastModeChange/);
  assert.match(chatWindowSource, /fastModeEnabled=\{fastModeEnabled\}/);
  assert.match(chatWindowSource, /onFastModeChange=\{session \|\| isNew \? handleFastModeChange : undefined\}/);
});

test("loads and changes the real OMP approval mode", () => {
  const changeSource = source.slice(
    source.indexOf("  const handleApprovalModeChange = useCallback"),
    source.indexOf("  const handleFastModeChange = useCallback"),
  );

  assert.match(source, /const \[approvalMode, setApprovalMode\] = useState<ApprovalMode \| null>\(null\)/);
  assert.match(source, /approvalModeFromSettings/);
  assert.match(source, /`\/api\/settings\?cwd=\$\{encodeURIComponent\(approvalCwd\)\}`/);
  assert.match(changeSource, /path: "tools\.approvalMode"/);
  assert.match(changeSource, /setApprovalMode\(mode\)/);
  assert.match(source, /approvalMode,[\s\S]*?handleApprovalModeChange/);
  assert.match(chatWindowSource, /approvalMode=\{approvalMode\}/);
  assert.match(chatWindowSource, /onApprovalModeChange=\{handleApprovalModeChange\}/);
});

test("wires Shift+Tab to OMP's model-aware effort cycle", () => {
  const cycleSource = source.slice(
    source.indexOf("  const handleCycleThinkingLevel = useCallback"),
    source.indexOf("  const handleFastModeChange = useCallback"),
  );

  assert.match(cycleSource, /type: "cycle_thinking_level"/);
  assert.match(cycleSource, /setThinkingLevel\(result\.level/);
  assert.match(source, /handleCycleThinkingLevel,[\s\S]*?handleFastModeChange/);
  assert.match(chatWindowSource, /onCycleThinkingLevel=\{session \|\| isNew \? handleCycleThinkingLevel : undefined\}/);
});

test("sends the Auto effort mode to OMP instead of changing only the label", () => {
  const thinkingSource = source.slice(
    source.indexOf("  const handleThinkingLevelChange = useCallback"),
    source.indexOf("  const handleCycleThinkingLevel = useCallback"),
  );

  assert.doesNotMatch(thinkingSource, /if \(level === "auto"\) return/);
  assert.match(thinkingSource, /type: "set_thinking_level", level/);
});

test("derives fast mode from model capability and persisted Session data", () => {
  assert.match(modelsRouteSource, /fastModeFamily: serviceTierFamily\(m\)/);
  assert.match(sessionReaderSource, /serviceTierByFamily: ompCtx\.serviceTier/);
  assert.match(source, /data\?\.context\.serviceTierByFamily/);
  assert.match(source, /fastModeAvailable/);
  assert.match(chatWindowSource, /fastModeAvailable=\{fastModeAvailable\}/);
});

test("uses translated notices for new effort and Speed failures", () => {
  for (const key of ["chat.noEffortLevels", "chat.effortCycleFailed", "chat.fastUnavailable", "chat.fastChangeFailed"]) {
    assert.match(englishMessages, new RegExp(`"${key}"`));
    assert.match(chineseMessages, new RegExp(`"${key}"`));
    assert.match(source, new RegExp(`translate\\("${key}"\\)`));
  }
  assert.doesNotMatch(source, /message: "Fast mode is unavailable for the current model/);
  assert.doesNotMatch(source, /message: "Failed to change the response speed/);
  assert.doesNotMatch(source, /message: "The current model does not support effort levels/);
  assert.doesNotMatch(source, /message: "Failed to cycle the effort level/);
});

test("builds rejected prompt recovery for the correct existing-session draft", () => {
  const image = {
    data: "AQID",
    mimeType: "image/png",
    previewUrl: "blob:preview",
  };

  assert.deepEqual(
    getRejectedPromptRecovery("Retry this prompt", [image], "existing-session", "sent-session"),
    {
      text: "Retry this prompt",
      images: [{ data: "AQID", mimeType: "image/png" }],
      targetDraftKey: "existing-session",
    },
  );
});

test("targets a newly created session when rejected prompt recovery follows creation", () => {
  assert.deepEqual(
    getRejectedPromptRecovery("Retry the new chat", undefined, undefined, "created-session"),
    {
      text: "Retry the new chat",
      images: undefined,
      targetDraftKey: "created-session",
    },
  );
});

test("leaves the recovery draft target empty before a session exists", () => {
  assert.deepEqual(
    getRejectedPromptRecovery("Retry later", [], undefined, null),
    {
      text: "Retry later",
      images: [],
      targetDraftKey: undefined,
    },
  );
});

test("a connection failure before promotion restores the current new-chat draft", () => {
  const recovery = getRejectedPromptRecovery("Keep my unsent text", undefined, undefined, "allocated-session", false);
  assert.equal(recovery.targetDraftKey, undefined);
  assert.equal(recovery.text, "Keep my unsent text");
});

test("reuses an open event stream and hides an empty agent phase", () => {
  const ensureSource = source.slice(
    source.indexOf("const ensureEventsConnected"),
    source.indexOf("const respondToExtensionUi"),
  );

  assert.match(ensureSource, /eventSourceSessionIdRef\.current === sid/);
  assert.match(ensureSource, /current\.readyState === EventSource\.OPEN/);
  assert.match(ensureSource, /attempt\?\.source === current && attempt\.pending/);
  assert.match(chatWindowSource, /agentRunning && !streamState\.streamingMessage && agentPhase/);
  assert.match(chatWindowSource, /return null;/);
});

test("the transcript uses the integrated scroll decision and exposes the existing re-pin action", () => {
  const scrollSource = source.slice(
    source.indexOf("  const handleScrollPositionChange = useCallback"),
    source.indexOf("  // Load session on mount"),
  );
  const repinSource = source.slice(
    source.indexOf("  const scrollTranscriptToBottom = useCallback"),
    source.indexOf("  const markUserScrollIntent = useCallback"),
  );

  assert.match(scrollSource, /nextPinnedStateForScrollEvent\(/);
  assert.match(scrollSource, /previousScrollTopRef\.current = metrics\.scrollTop/);
  assert.match(repinSource, /setPinned\(true\)/);
  assert.match(repinSource, /container\.scrollHeight - container\.clientHeight/);
  assert.match(repinSource, /scrollToBottom\("smooth"\)/);
  assert.match(source, /scrollTranscriptToBottom,/);
});

test("upward user scroll stays detached while streaming tokens renew the ignore window", async () => {
  const originalFetch = globalThis.fetch;
  let latestSession;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { models: {}, modelList: [], defaultModel: null };
    },
  });

  function Harness() {
    latestSession = useAgentSession({ session: null, newSessionCwd: "/tmp" });
    return h(
      "div",
      { ref: latestSession.scrollContainerRef },
      h("div", { ref: latestSession.messagesEndRef }),
    );
  }

  const view = await mount(h(Harness));
  const transcript = view.container.querySelector("div");
  const end = transcript.querySelector("div");
  transcript.clientHeight = 600;
  transcript.scrollHeight = 4000;
  transcript.scrollTop = 3400;
  transcript.scrollTo = ({ top }) => {
    transcript.scrollTop = Math.min(top, transcript.scrollHeight - transcript.clientHeight);
    transcript.dispatchEvent(new DomEvent("scroll"));
  };
  end.scrollIntoView = () => { throw new Error("Transcript scrolling must not move ancestor containers"); };

  const settleFrame = async () => {
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  };
  const streamToken = async (text, scrollHeight) => {
    transcript.scrollHeight = scrollHeight;
    await React.act(async () => {
      latestSession.dispatch({ type: "update", message: { role: "assistant", content: text } });
    });
    await settleFrame();
  };

  try {
    await React.act(async () => latestSession.setAgentRunning(true));
    await settleFrame();
    await streamToken("one", 4200);
    await streamToken("two", 4400);

    await React.act(async () => {
      transcript.dispatchEvent(new DomEvent("keydown", { key: "ArrowUp", bubbles: true }));
      transcript.scrollTop -= 30;
      transcript.dispatchEvent(new DomEvent("scroll"));
    });

    assert.equal(latestSession.transcriptPinned, false);
    const detachedTop = transcript.scrollTop;

    await streamToken("three", 4600);
    assert.equal(latestSession.transcriptPinned, false);
    assert.equal(transcript.scrollTop, detachedTop, "new tokens do not move a detached transcript");

    await React.act(async () => latestSession.scrollTranscriptToBottom());
    assert.equal(latestSession.transcriptPinned, true, "the existing newest-message action restores the pin");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("plays the enabled sound once for each extension dialog", () => {
  assert.match(chatWindowSource, /soundedExtensionDialogIdRef = useRef<string \| null>\(null\)/);
  assert.match(
    chatWindowSource,
    /soundedExtensionDialogIdRef\.current === extensionDialog\.id/,
  );
  assert.match(chatWindowSource, /soundedExtensionDialogIdRef\.current = extensionDialog\.id/);
  assert.match(chatWindowSource, /playDoneSoundRef\.current\(\)/);
});

test("keeps completed subagents in the session history", () => {
  assert.match(source, /function mergeSubagentSnapshots/);
  assert.match(source, /const finished: SubagentSnapshot/);
  assert.match(source, /progress: previous\?\.progress \? \{ \.\.\.previous\.progress, status: terminalStatus \}/);
  assert.doesNotMatch(source, /payload\.status !== "started"\) \{\s*setSubagents\(\(previous\) => previous\.filter/);
});

test("routes blocking extension requests through deduplicated browser attention notifications", () => {
  const completionSource = appShellSource.slice(
    appShellSource.indexOf("  const handleAgentEnd = useCallback"),
    appShellSource.indexOf("  const handleAttentionNeeded = useCallback"),
  );
  const extensionRequestSource = source.slice(
    source.indexOf("  const handleExtensionUiRequest = useCallback"),
    source.indexOf("  const settleUiStage = useCallback"),
  );
  const attentionSource = appShellSource.slice(
    appShellSource.indexOf("  const handleAttentionNeeded = useCallback"),
    appShellSource.indexOf("  const handleAutoName = useCallback"),
  );

  assert.match(
    extensionRequestSource,
    /isBlockingExtensionUiRequest\(request\)[\s\S]*?onAttentionNeeded\?\.\(request\)/,
  );
  assert.match(chatWindowSource, /onAttentionNeeded, onSessionCreated/);
  assert.match(completionSource, /if \(!shouldShowBrowserNotification\(\)\) return/);
  assert.match(attentionSource, /shouldShowBrowserNotification\(\)/);
  assert.match(attentionSource, /claimExtensionAttentionNotification\(request, notifiedAttentionRequestIdsRef\.current\)/);
  assert.match(attentionSource, /tag: `pi-extension-ui:\$\{request\.id\}`/);
  assert.match(appShellSource, /onAttentionNeeded=\{handleAttentionNeeded\}/);
});

test("/collab keeps the encrypted host state and participant stream in the browser", () => {
  const collabSource = source.slice(
    source.indexOf('case "collab":'),
    source.indexOf('case "fork":'),
  );

  assert.match(collabSource, /await ensureEventsConnected\(sid\)/);
  assert.match(collabSource, /type: "collab"/);
  assert.match(collabSource, /applyCollaborationSnapshot/);
  assert.match(collabSource, /collaborationActiveRef\.current = result\.collaboration\.active/);
  assert.match(source, /case "collab_status"/);
  assert.match(source, /agentState\.state\?\.collaboration\?\.active/);
});


test("/fork is consumed locally and surfaces server resolution errors", () => {
  const forkCaseSource = source.slice(
    source.indexOf('case "fork":'),
    source.indexOf("default: {", source.indexOf('case "fork":')),
  );

  assert.match(source, /case "fork": \{/);
  assert.match(forkCaseSource, /const result = await handleFork\(\);/);
  assert.doesNotMatch(forkCaseSource, /messages|entryIds|newestUserEntryId/);
  assert.match(forkCaseSource, /complete\(\{ handled: true, error: result\.error \?\? "Fork failed" \}\)/);
  assert.match(forkCaseSource, /complete\(\{ handled: true, message: "Forked a new session" \}\)/);
  // Every branch returns handled, so /fork never reaches the SDK fallback that
  // forwards the message as an LLM prompt — the case ends in a handled return
  // and yields to the next explicit case, not the default bridge.
  assert.doesNotMatch(forkCaseSource, /execute_slash_command/);
  assert.doesNotMatch(forkCaseSource, /type: "prompt"/);
  assert.match(source, /case "fork":[\s\S]*?return complete\(\{ handled: true, message: "Forked a new session" \}\);\s*\}\s*case "handoff": \{/);
});

test("fork navigation selects the new session id from the RPC result", () => {
  const forkSource = source.slice(
    source.indexOf("const handleFork = useCallback"),
    source.indexOf("const handleNavigate = useCallback"),
  );

  assert.match(forkSource, /const handleFork = useCallback\(async \([\s\S]*?entryId\?: string,[\s\S]*?Promise<\{ forked: boolean; error\?: string \}>/);
  assert.match(forkSource, /type: "fork"/);
  assert.match(forkSource, /\.\.\.\(entryId \? \{ entryId \} : \{\}\)/);
  assert.match(forkSource, /const \{ cancelled, newSessionId \} = result \?\? \{\};/);
  assert.match(forkSource, /if \(!cancelled && newSessionId\) \{/);
  assert.match(forkSource, /onSessionForked\?\.\(newSessionId\);\s*\n\s*return \{ forked: true \};/);
  assert.match(forkSource, /error: e instanceof Error \? e\.message : String\(e\)/);
  assert.match(forkSource, /setForkingEntryId\(null\)/);
});

test("/handoff forwards the focus text verbatim and keeps the UI busy", () => {
  const handoffCaseSource = source.slice(
    source.indexOf('case "handoff":'),
    source.indexOf("default: {", source.indexOf('case "handoff":')),
  );

  assert.match(source, /case "handoff": \{/);
  // The text after /handoff is forwarded exactly as the handoff focus.
  assert.match(handoffCaseSource, /type: "handoff"/);
  assert.match(handoffCaseSource, /\.\.\.\(args \? \{ customInstructions: args \} : \{\}\)/);
  // The long oneshot generation keeps the composer busy through existing
  // agent-running state, with no new state machine.
  assert.match(handoffCaseSource, /if \(agentRunningRef\.current \|\| bashRunningRef\.current\)/);
  assert.match(handoffCaseSource, /Cannot hand off while the session is busy/);
  assert.match(handoffCaseSource, /agentRunningRef\.current = true/);
  assert.match(handoffCaseSource, /setAgentRunning\(true\)/);
  assert.match(handoffCaseSource, /agentRunningRef\.current = false/);
  assert.match(handoffCaseSource, /setAgentRunning\(false\)/);
  // Cancellation resolves locally as an error; /handoff never falls through to
  // the SDK command bridge or an LLM prompt.
  assert.match(handoffCaseSource, /if \(!result \|\| result\.cancelled\)/);
  assert.match(handoffCaseSource, /complete\(\{ handled: true, error: "Handoff cancelled" \}\)/);
  assert.doesNotMatch(handoffCaseSource, /execute_slash_command/);
  assert.doesNotMatch(handoffCaseSource, /type: "prompt"/);
  const connectIndex = handoffCaseSource.indexOf("await ensureEventsConnected(sid)");
  const dispatchIndex = handoffCaseSource.indexOf('type: "handoff"');
  assert.ok(connectIndex >= 0);
  assert.ok(dispatchIndex > connectIndex);
  assert.match(handoffCaseSource, /scheduleEventStreamClose\(sid\)/);
});

test("/handoff reloads the same session after an in-place compaction", () => {
  const handoffCaseSource = source.slice(
    source.indexOf('case "handoff":'),
    source.indexOf("default: {", source.indexOf('case "handoff":')),
  );

  assert.match(
    handoffCaseSource,
    /sendAgentCommand<\{ cancelled\?: boolean \}>[\s\S]*?type: "handoff"/,
  );
  // omp 18 hands off in place: the session id never changes, so success
  // reloads this transcript instead of navigating to a replacement session.
  assert.doesNotMatch(handoffCaseSource, /newSessionId/);
  assert.doesNotMatch(handoffCaseSource, /onSessionForked/);
  assert.match(handoffCaseSource, /if \(await loadSession\(sid, true\)\) promoteNewSession\(\);/);
  // Every branch returns handled so the command never reaches the SDK
  // fallback — the busy state is torn down in a finally block and the case
  // yields to the default bridge with a return.
  assert.match(handoffCaseSource, /complete\(\{ handled: true, message: "Context handed off and compacted in place" \}\)/);
  assert.match(source, /case "handoff":[\s\S]*?return complete\(\{ handled: true, message: "Context handed off and compacted in place" \}\);\s*\}\s*finally \{[\s\S]*?\}\s*\}\s*default: \{/);
});

test("rehydrates handoff as busy without misreporting compaction", () => {
  assert.match(source, /isHandoffRunning\?: boolean/);
  assert.match(
    source,
    /state\.isStreaming \|\| state\.isPromptRunning \|\| state\.isCompacting \|\| state\.isHandoffRunning/,
  );
  assert.match(
    source,
    /agentState\.state\?\.isStreaming[\s\S]*?agentState\.state\?\.isPromptRunning[\s\S]*?agentState\.state\?\.isHandoffRunning/,
  );
});
