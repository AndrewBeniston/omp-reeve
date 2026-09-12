# Reeve

A desktop workspace for the OMP coding agent. Reeve reads OMP Session files and
drives the OMP runtime, so Reeve and the terminal share one store and vocabulary.

This file is a glossary. `AGENTS.md` holds the architecture and its traps.
`DESIGN.md` holds the interface decisions and the token tiers.

## Language

**Reeve**:
The desktop workspace that presents the OMP engine through a graphical interface.
_Avoid_: OMP-Web, OMP Desktop, omp-web

**OMP**:
The coding-agent engine that Reeve runs. OMP owns Sessions, models, tools, and configuration.
_Avoid_: Reeve when referring to the engine

**Session**:
One conversation with the agent, stored as a single `.jsonl` file under a
directory named for its working directory.
_Avoid_: chat, thread, conversation

**AgentSession**:
The live in-process agent that omp creates to answer a prompt. A Session can
exist on disk with no AgentSession running.
_Avoid_: agent instance, runtime session

**Wrapper**:
The single object that owns one AgentSession and its event stream. One Wrapper
exists per Session id.
_Avoid_: manager, handle, controller

**Fork**:
A new independent Session, created from a point in an existing one. It gets its
own file and appears as a child in the navigation tree.
_Avoid_: branch, copy, duplicate

**In-session branch**:
An alternative reply path inside one Session file. Several branches share one
parent entry, and the reader switches between them.
_Avoid_: fork, variant

**Project**:
The repository that owns a Session's working directory. Sessions from every
Worktree of one repository group under one Project.
_Avoid_: repo, folder, workspace

**Worktree**:
A second checkout of one Project, on its own branch. It groups under its
Project rather than appearing as a separate Project.
_Avoid_: clone, checkout

**Compaction**:
A summary that replaces earlier turns once a Session grows too long. It renders
at the point in the transcript where it happened, not at the top.
_Avoid_: summary, truncation, condensation

**Model role**:
A named scope of work that carries its own model choice, such as `default`,
`plan`, or `commit`. Choosing a model in the browser writes the same role the
terminal writes.
_Avoid_: model slot, profile, preset

**Tool preset**:
A named set of tools granted to a Session when it is created.
_Avoid_: tool profile, tool role

**Project trust**:
Reeve's own record of which Projects may run their local executable
resources. omp has no such record, because running omp in a directory is itself
the decision. Opening a browser tab is not.
_Avoid_: allow-list, permission, sandbox

**Palette**:
The set of colour variables that one omp theme supplies to the browser. The
exact contract is the Tier 1 adapter contract in `DESIGN.md` section 4.1.
_Avoid_: theme, colour scheme, skin

## Interface

**Quick chat**:
A compact Session view that uses the same Composer and OMP capabilities as the main Session view.
_Avoid_: separate agent, temporary conversation

**Command palette**:
The keyboard-operated search for Sessions and available application actions.
_Avoid_: Palette, power searcher

**Add menu**:
The Composer menu that groups attachments, supported actions, Plugins, and Skills.
_Avoid_: upload button, slash-command list

**Chats group**:
The single navigation group for Sessions created without a selected Project.
_Avoid_: Chats folder, Project

**Composer**:
The message frame at the bottom of a Session view, with its text row and its
footer row of controls.
_Avoid_: chat box, chat bar, omnibox, input box

**Context donut**:
The ring in the Composer footer that shows how much of the model's context
window a Session has used. It appears after the first reply and opens the
Session menu.
_Avoid_: context meter, context bar, usage indicator

**Session menu**:
The menu on the Context donut that holds the Session's token counts, cost,
and Compact.
_Avoid_: session details, session info, stats panel

**Approval mode**:
The OMP policy that decides which tool tiers run without confirmation.
_Avoid_: Project trust, Tool preset

**Approval selector**:
The Composer control that displays and changes the Approval mode.
An untrusted Project uses the same position for its Project trust action.
_Avoid_: Mode pill, permission badge, trust button

**Fixture**:
The scratch Project and its three neutral Sessions used for every screenshot
and every live check. No real Session appears in evidence.
_Avoid_: demo data, sample project, test data

**Archived Session**:
A Session hidden from the navigation tree and kept on disk unchanged. The mark
lives in Reeve's own registry, never in the Session file.
_Avoid_: deleted session, hidden session, trashed session

**Browser setting**:
A Settings row the browser owns and stores, shown beside OMP's own rows. It
never reaches OMP's config file.
_Avoid_: web setting, local preference, client setting

**Right panel**:
The resizable column beside a Session view that holds Tabs.
_Avoid_: sidebar, file panel, drawer, inspector

**Tab**:
One surface in the Right panel, of exactly one kind. A Session is never a Tab.
_Avoid_: pane, view, window, panel

**Tab strip**:
The row across the top of the Right panel listing open Tabs, ending with the
control that opens the Launcher.
_Avoid_: tab bar, file tabs, open files

**Launcher**:
The list of every kind a Tab can be, shown as the Right panel's empty state and
from the Tab strip. It lists kinds that are not built yet.
_Avoid_: new tab menu, plus menu, add menu

**Browser tab**:
A Tab holding a web page that the desktop process owns and draws, so the page is
an ordinary Chromium page target.
_Avoid_: webview, guest, embedded browser, iframe

**Terminal tab**:
A Tab holding the human's own login shell, fixed to the Project directory it was
opened in.
_Avoid_: console, shell pane, command window

**Agent browser access**:
The recorded grant that lets an agent drive this application over Chromium's
debugging protocol. It takes effect at the next launch, never the one that
recorded it.
_Avoid_: CDP toggle, debug mode, remote control

**Dictate control**:
The microphone control in the Composer footer, rendered hidden until a
dictation path exists.
_Avoid_: mic button, voice button, speech control

## Release

**Release**:
One tagged version of Reeve with the packages built for it, published on
GitHub Releases. A Release may carry one platform or every platform. The tag
is `v<version>` and only the release script writes it.
_Avoid_: build, version bump, deploy

**Package**:
One installable file for one target: a macOS DMG and ZIP pair, a Windows
installer, or a Linux AppImage.
_Avoid_: artifact, binary, bundle

**Update feed**:
Every Platform feed together. See ADR-0013.
_Avoid_: manifest, update channel, release metadata

**Platform feed**:
The one `latest*.yml` file that an installed Reeve on one platform reads to
learn about a newer version. It names the version, the file hashes, and the
full address of each Package. One platform's feed never decides what another
platform sees.
_Avoid_: channel file, manifest, yml

**Update card**:
The sidebar card that reports a download in progress and offers Restart now
when the update is ready.
_Avoid_: update banner, notification, toast

**What's New**:
The dialog on the first launch after a version change that lists every
version section newer than the last one seen.
_Avoid_: changelog dialog, release notes popup, onboarding

**Support page**:
The second What's New page, shown only when the newest version carries
`support: true`, with the Ko-fi and Star on GitHub actions.
_Avoid_: donation page, sponsor screen, upsell

**Build machine**:
A computer Andrew owns that builds one or more Packages from a clean checkout
of the tag. The GitHub runner is a paid fallback, never the default.
_Avoid_: CI, runner, pipeline
