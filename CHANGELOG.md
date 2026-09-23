# Changelog

All notable changes to Reeve are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

A version header may carry `support: true`. On the first launch of that version
the What's New dialog adds a second page that invites support.

## [Unreleased]

### Added

- Session history can load earlier pages and keep the cursor after a read failure.
- Add a pure Turn folder and a recorded OMP event stream for future Session transcript rendering.
- Track the Turn phase as assistant text and activity arrive, including the settled phase for saved Sessions.

## [0.8.0] - 2026-09-23

### Added

- The agent can read the terminal you have open beside a chat. Ask it what the
  shell is doing and it reports the shell and the directory that shell started
  in, without asking you to copy anything across. It answers plainly when no
  terminal is open, and it never types into your shell. This works in the
  desktop application only, because a browser tab owns no shell of yours.

### Changed

- Reeve now runs OMP 18.2.11, so the latest models work. Claude Opus 5.5
  answers now. Before, Anthropic refused it with "version too old".

### Fixed

- `/collab list` now shows the active local collaboration hosts. OMP added
  the command, and Reeve showed it in the menu but refused to run it.

- A chat with an attached image no longer opens the application error page
  after OMP restores the image from its session store.

- The application error page now follows the active Reeve theme and uses
  Autospawn Sans while keeping its Reload and Back recovery controls.

## [0.7.0] - 2026-09-16

### Added

- File icons are typed everywhere they are drawn. A TypeScript file, a
  lockfile, a Dockerfile, a stylesheet and the rest now show their own icon in
  their own colours, in the Review tree and headings, the file explorer, the
  tab bar and the sources list. Every name the app can ask for is mapped to an
  icon that ships with it, and the generic file and folder still follow the
  interface text colour.

- Step through a change with the file list hidden. Next and previous file
  steps now sit above the diffs whenever the list is put away, with the file
  you are reading and where it sits in the change, so a review can be walked
  without the tree. A large diff keeps the same pair in its banner. The steps
  walk every file in the review, never the subset a typed filter happens to be
  showing.

- A review comment now follows its lines. Commit, or move the diff on, and a
  comment finds the lines it was written about and stays with them. When those
  lines were deleted, or when the file no longer shows which of several places
  they were, the comment is kept and marked detached rather than attached to a
  line it might not be about. A comment whose file has left the review, or
  whose file is not drawing a diff in the view you are in, is kept above the
  diffs where it can still be read, edited, handed over and removed. Handing
  comments to the chat now names the lines each one sits on now. Nothing is
  moved quietly, and nothing is thrown away for you.

- Walk a review from the keyboard. The changed-file list is a tree and behaves
  like one: Up and Down move between rows, Home and End reach the ends, Left
  collapses a folder or climbs to its parent, Right opens one or steps into its
  first child, Enter opens a file, and "v" marks the focused file viewed. The
  whole tree is one stop on the Tab key, so a forty-file change is a walk rather
  than forty tab stops, and Tab still leaves it in both directions. The row with
  focus says so plainly.

- A file you have marked viewed now says so in the changed-file tree as well as
  on its heading, keeps that mark when Reeve is restarted, and loses it the
  moment the file changes underneath it.

- Submit a review from Review without losing work. Approve, request changes
  with a summary, or comment with no verdict, each sent only through a
  confirmation that names the account, the pull request and the commit and
  base it is anchored to, and each carrying the line comments you saved
  against that revision in one submission. Before the confirmation opens,
  Review asks where the pull request stands now and says so when the head or
  the base has moved; a check it cannot make is reported as unknown rather
  than read as unchanged. A refusal and a write whose answer never arrived
  both keep every draft, and an unconfirmed one stays marked rather than
  being offered as a blind second attempt. Drafts now survive a push: they
  are kept against the commit they were written against, drafts written
  against an earlier revision are listed apart and dated instead of being
  drawn on lines they were never read on, and drafts saved before this
  version are carried forward rather than stranded.

- Take part in a pull-request discussion from Review. Reply to a published
  thread, edit or delete a comment you wrote, and resolve or reopen a thread,
  each confirmed before anything is sent. Only what GitHub says your account
  may do is offered, and the same answer is checked again at the moment of
  sending, so a tab left open through a change of standing cannot talk past it.
  Deleting reaches only your own comment. Backing out of a confirmation leaves
  your local drafts exactly as they were, and a thread action never publishes,
  clears, or borrows a draft you are still writing beside it. Where the answer
  to a thread action never arrives, it is reported as unconfirmed and kept
  rather than offered as a blind second attempt.

- Read a pull request and its discussion in Review. Pick a GitHub remote, list
  and search its pull requests, and open one to read its changed files beside
  the threads already published on it. Both are read against the same head and
  base pair, so the diff and the comments always describe one snapshot. If
  either end moves between fetches, the refetch is refused with what the pull
  request is on now instead of being mixed into what you are reading. A missing
  GitHub CLI, a missing sign-in, a host that cannot be reached, and an answer
  that arrived incomplete are each stated in their own words with a way to try
  again, and none of them is shown as a repository with no pull requests. Where
  GitHub does not say what your account may do, the discussion is read-only
  rather than offering a form that would be refused.

- Commit, branch and publish from Review. Work here creates a branch or checks
  one out before you commit, and says plainly when another worktree already
  holds a branch rather than letting Git refuse it afterwards. Create pull
  request opens one from the branch you are on, as a draft if you choose, with
  a title and a description you write or have written for you, and it offers to
  push the branch first when the remote does not have it yet. A branch that
  already has an open pull request offers to open that one instead of raising a
  second. GitLab is the same form throughout, saying merge request. Every
  command is bound to the repository your remote names, and a result the host
  did not confirm is reported as unconfirmed rather than retried.

- Stage, unstage and revert a hunk while whitespace changes are hidden. The
  panel reads that diff differently from the one Git applies from, so an
  operation is now matched back to the exact change it was taken from by the
  lines it covers, and it moves those lines and no others. Anything that cannot
  be matched with certainty, or that names content the file no longer holds, is
  refused whole rather than applied to something near it, and Review reloads so
  you can see what refused it.

- Ask the agent to review your changes. Review's menu and a `/review` command
  in the composer both start a review of the uncommitted changes or of this
  branch against a base you pick, and the composer lists the branches to pick
  from. A branch review is pinned to the commit the two branches last shared,
  and it stops rather than guessing when they share none. The answer arrives in
  the Session you asked from, or in a new chat of its own if you choose that.
  Nothing is sent by opening Review or changing a setting.

- Choose how reviews are run, under Code review in settings. Automatic review
  is off until you turn it on, and then it runs only when you publish or push
  through Reeve, or, if you pick the experimental option, when changes arrive
  during a review you started. A security pass can ride along with it, reviews
  can be told to keep looking until they find nothing new, and each kind of
  review has a minimum severity to report. The reference's credit allowance is
  shown as unavailable: what a review spends follows the provider policy for
  the model it runs on.

- Stop approving every command by hand. Once you have approved three commands
  in one chat, the next approval Reeve asks for comes with an offer: let it
  approve eligible actions for you, and be asked only about anything it detects
  as potentially unsafe. Accepting says plainly that future eligible commands
  will not ask again, and declining is permanent.

- Review non-text and noisy files. Images and PDFs preview beside their before
  and after versions, and Markdown and SVG preview once you switch rich preview
  on. A binary Review cannot draw says it is binary rather than leaving an
  empty pane, a merge-conflicted file says what is in conflict instead of
  showing its markers as content, and files the repository marks generated can
  be hidden from the list and brought back from the same switch.

- Read a diff the way Review means it. Renames, mode changes, new files and
  deleted files now say what happened above their lines, so a rename that
  changed nothing and a file that only became executable no longer look like an
  empty pane. Whitespace-only changes can be hidden from the menu, which reads
  the diff again rather than filtering the one on screen, and staging or
  expanding a file still works while they are hidden. Diffs carry three lines
  of context and open whole files when full-file loading is on, and the diff
  text, line height and spacing now match the values Review is modelled on.

- Open a reviewed file where you want it. A file opened from Review arrives in
  its own tab at the line you were reading, with the changed lines marked and a
  breadcrumb above them, and it opens files the preview used to refuse: reading
  stops at 20 MiB, a file over 10 MiB opens read-only, and whether a file is
  text is decided by its first bytes rather than its name. A diff too large to
  draw now opens the file itself rather than a refusal. In the desktop
  application the file can be edited in place: edits save three seconds after
  you stop typing, a save never lands on a version somebody else changed
  first, a change elsewhere in the file is merged, and a change to the same
  lines is held for you to decide rather than overwritten. A save that fails
  leaves the original file exactly as it was. Review's menu also
  copies a file's diff, and opens a file in an installed editor, terminal or
  file manager — each one detected on this machine, with your own handlers
  added through `omp-web-external-editors.json`, and choosing one there does
  not change what files open in next time.

- A large Review diff stays readable. A file's diff is drawn as it comes near
  the viewport rather than all at once, so a multi-thousand-line review scrolls
  without stalling. Where a limit applies it now says what it is holding back
  and offers a way through: a file too large to draw names the limit it passed
  and offers to open itself, a diff too large to read at all explains the size
  ceiling instead of failing generically, and the untracked notice says how
  many files are missing and why.

- Review keeps up with files changed outside the application. A background
  refresh leaves an unchanged diff exactly where it is, holds a change back
  while a comment is being written rather than discarding the draft, and says
  plainly whether watching is partial or unavailable here — including a
  watcher that is lost after the view opened — with Refresh always beside the
  sentence.
  Last turn follows its Session's own runs, so a prompt that starts or
  finishes updates it without a manual step, and a turn Review can only show
  in part says so and names what is missing.

- Browse pull requests from Project remotes, inspect diffs and published threads, and keep PR drafts separate from local Review comments. Publishing uses an explicit confirmation and retains drafts when the outcome is uncertain.

- Review display options now expand or collapse diffs, toggle word highlighting, and control full-file loading for supported local scopes.

- Keep Review filenames visible in narrow panels with compact file action icons.

- A control at the end of the tab strip above the panel beside a chat. It
  fills the workspace with the panel, gives the width back, and prints the
  `Ctrl+]` chord that does the same. Maximising now covers the chat rather
  than stopping at a reserved column, and dragging still leaves the chat its
  room. Panel visibility stays where it was, on the header.

- `Cmd+Alt+B` shows or hides the panel beside a chat, and the header toggle
  prints the chord and reads as pressed while the panel is open. That same
  toggle joins the tab strip while the panel fills the workspace and the
  header is behind it.

- Adding a changed file to the chat from Review writes a path that chat can
  resolve. Paths are relative to the Project the Review tab was opened in, and
  the control appears only while that Project is the selected chat's own.

- Review says why it has nothing to show. A directory outside a Git
  repository, or a machine without Git, gets a plain sentence instead of a
  failed load.

- Stage, unstage and revert changes from Review. A pill floating over the diff
  moves every change in view, and each file and each hunk carries its own
  control. A revert asks before it removes anything, and can be told to stop
  asking. Review refuses the whole operation when the changes have moved on
  since you looked at them, and it names every file it could not move, so a
  section that left a conflicted file behind never reports a clean run. A
  change that will not apply cleanly is left exactly as it was, rather than
  merged and marked up.

- Commit staged or uncommitted changes from Review. The Commit or push control
  opens a form that writes a message for you, can land the commit on a new
  branch, and says why it cannot run when it cannot. A commit carries the whole
  index, so anything staged outside the review is named and has to be accepted
  before it travels, and changes that moved since the form opened stop the
  commit rather than being committed unseen. A branch that is ahead can be
  pushed on its own. Creating a pull request is not built yet.

- An empty Review now says which view is empty: no staged changes, no unstaged
  changes, or no changes at all.

- Review's Last turn view shows the selected Session's recorded changes.
  It explains unavailable snapshots and lists files the capture skipped.
  Snapshot review does not offer Git mutations or full-file expansion.

- Expand unchanged lines in Review using the diff viewer's context controls.
  File contents are bounded to 2 MB and checked against the displayed version.
  Changed or unavailable content leaves the displayed patch intact.

- Write comments on a line or a range in Review. Drag over the lines, write the
  note, and it stays in the panel: nothing is sent and no prompt is submitted.
  Comments can be edited, deleted, and handed to the chat beside them, either
  as notes or as a request to make the changes, and the text is inserted into
  the composer so whatever you were already writing survives. They belong to
  the chat they were written beside and are never offered to another one. A
  comment whose file has since changed is marked outdated instead of being
  moved to lines it was not written about.

- Open a Review tab beside a Session to inspect Git changes. Choose a comparison branch or a commit from menus.
  Filter changed files and move between their diffs. Binary and rename-only changes remain visible.
  Resize the changed-file list with its divider or keyboard, and reset it to its default width.
  Open a changed working file in its own tab from Review.
  Mark branch diffs as viewed. A later change to the diff makes the file unviewed again.
  Switch Review between unified and split diffs, and wrap long lines from the native context menu.
  Large reviews show one file at a time while keeping the complete file list available.
  Reopening a closed tab after switching Projects no longer restores a tab from the previous Project.

- Keyboard movement between the tabs beside a chat. `Ctrl+Tab` and
  `Ctrl+Shift+Tab` step through them, and they wrap around the ends.
  `Cmd+Shift+]` and `Cmd+Alt+Right` do the same, as do their mirrors for
  stepping back. `Cmd+1` to `Cmd+9` jump straight to one tab.

- Reopen the tab you just closed with `Cmd+Shift+T`. A browser tab comes back
  at the address it held. A terminal never comes back, because its shell ended
  when you closed it.

- Close every tab except the one you are looking at, with `Cmd+Alt+W`. They all
  stay reopenable.

- Keyboard control of a browser tab. `Cmd+L` selects the address, and `Cmd+Left`
  and `Cmd+Right` move the page back and forward. On Windows and Linux the
  history keys are `Alt+Left` and `Alt+Right`.

- `Ctrl+]` makes the panel beside a chat fill the room, and pressing it again
  returns it to the width you had. Neither is remembered, so a restart still
  opens at the width you dragged it to.

- Keyboard shortcuts for the right panel, on the View menu. `Cmd+T` opens a
  browser tab, `Ctrl+backtick` opens a terminal, and `Cmd+P` searches the
  project's files. They work while a web page has focus, because the menu
  holds them rather than the page. Review and Side chat are listed and
  greyed, because Reeve has not built them yet.

- A review can now attach a finding to the line it is about. Reeve asks the
  agent for an inline comment beside its ordinary answer, and it records what
  the review was asked to read at the moment it asks. A finding is drawn only
  against that recorded revision, so it follows its lines when the file moves,
  and it says why it cannot be drawn once the file has changed past
  recognition. A finding is never put on a guessed line. Reeve reads only the
  Session the Review belongs to, so a review delivered into a separate chat
  leaves its findings in that chat. Putting a finding away hides it from the
  diff, keeps the turn in the transcript, and can be undone.
  A finding is drawn under the line it names, above a published thread and
  above your own comments, and it says which model wrote it. One that sits on
  no line is kept beside its file, or with the review when no diff on screen
  shows that file, so none is ever hidden. Show dismissed findings, on the
  options menu, brings back what has been put away and counts it. A finding
  can be added to the chat the same way a comment can, by the lines it is on
  now. The findings are read again when the Session settles a run, so a review
  that has just finished appears without a refresh.

### Changed

- The list of applications a reviewed file can be opened in now matches the
  reference entry for entry. Devin Desktop is offered on macOS, detected by
  its own launcher inside the application bundle rather than by any command
  named `devin` on the machine. Six entries take the reference's wording:
  VS Code, VS Code Insiders, iTerm2, Kitty, Default app, and the file manager,
  which now calls itself Finder, File Explorer or File manager to suit the
  platform. Positron, Neovim and CLion stay, and no saved choice changes.
  A page also behaves the same way everywhere: an `.html` or `.htm` file now
  leads with the browsers on Windows as well as on macOS and Linux, and Linux
  asks the desktop which applications claim `https` instead of listing the
  first few desktop entries it finds.

- Review's options menu now matches the reference, and carries a new Copy git
  apply command. The rows are in the reference's order and wording, in two
  groups either side of a divider: Refresh and word wrap above it, then full
  files, rich preview, word diffs, white space and the new copy row below.
  The copy row puts the whole review on the clipboard as one runnable shell
  command that changes to the repository and pipes the patch into
  `git apply --3way`, so a review can be reproduced somewhere else with a
  single paste.
  Refresh now sits in that menu only. The duplicate icon beside it is gone,
  and every other way to reload a review stays where it was.

- Review now draws the reference's own measurements. Controls, changed-file
  rows and toolbar text, the focus ring, the disabled state and the corner
  radii all follow the shipped values, and the rest of the interface keeps its
  own scale.
  Hover follows them too: a row or a control under the pointer now takes the
  reference's own wash, lighter in a light theme and stronger in a dark one,
  and every button Review shares with the rest of Reeve now draws the
  reference's corner inside Review and its usual corner elsewhere.

- Dev Next server heap-statistics checks are cached for five seconds under Bun.

- The Review panel's structure follows the reference more closely: the header
  is one row with the scope, the +/− totals and the actions beside Commit or
  push; the changed-files list is a nested tree with chained folders, orange
  change dots, a green U for untracked files and the selected file's own
  add-to-chat control. The large-diff notice is a banner at the top of the
  diff with the file steppers, the new-tab control in the strip is bare at
  rest, and the branch scope carries a chevron like the other pickers.

### Removed

- The typography tuner overlay that appeared in the corner of the development
  server. It was a prototype for sizing text while the shell was being drawn,
  and it is no longer needed. Typography tokens and themes are unchanged.

### Fixed

- Copying from Review works again in the desktop application. Copy git apply
  command, Copy diff and Copy path all left the clipboard untouched there,
  because the shell refuses the clipboard interface to the page and the
  fallback that would have carried the copy was never reached. The fallback
  now runs whenever the interface refuses. A copy that both paths refuse says
  so in the panel, where Copy path used to fail without a word.

- The Review context menu now lists the applications a file can be opened in.
  Its Open with submenu held only New tab and a greyed "Looking for
  applications…" row, on every open, because the menu stopped waiting for the
  list before the list could arrive. It now waits a short moment for the list,
  which is longer than the answer normally takes. On a machine slow enough to
  miss that moment the list is kept when it arrives, so the next right click
  on the same file carries it. A list that could not be read is not kept, and
  the next right click asks again.

- Typed file icons now follow the app theme instead of the operating system.
  A light theme on a dark desktop drew the dark icons, and the reverse. The
  icons now change with the theme, like every other colour on the row.

- An automatic follow-up review now starts instead of being lost in the
  composer. The panel and the composer could disagree about whether the
  Session was busy, and the follow-up was counted as spent before it was
  sent. A follow-up is now counted only when the review turn starts, it asks
  the composer again a few times while the turn finishes, and it never writes
  a prompt into the composer. A review you ask for yourself is still kept in
  the composer when the Session is busy.

- A Review Tab whose Session is not the one selected now says so. Comments are
  handed to the Session the Tab was opened beside, and when that is not the
  Session on screen the panel asks for that one by name rather than telling you
  to open a chat you may already have open.

- Filtering the changed-file list now narrows only that list. The file you were
  reading and the place you had scrolled to stay exactly where they were.

- A file named by its path now draws the same icon as the same file named by
  itself, so a Review heading, a tab and a tree row agree about what a
  lockfile, a Dockerfile or a .gitignore is.

- The tab strip beside a chat now scrolls the active tab into sight. Before
  this, a tab reached with `Cmd+9` could be selected while staying off the
  edge of the strip.

- The Open with menu now supports the arrow keys. Escape closes the menu and
  returns focus to its button.

- Images and PDFs now load in pull-request reviews. Preview reads use the
  pinned revisions and refuse results if the pull request changes.

- Creating a pull request now offers an explicit option to commit and push
  local changes. It refuses the commit if those changes no longer match the
  displayed state.

### Security

- Pull-request description generation now validates the base revision.
  Invalid values cannot become Git options or write diff output to files.

## [0.6.0] - 2026-09-12

### Added
- Each platform now reads its own update feed. A release can carry one platform
  or every platform. A macOS copy is no longer disturbed by a Windows release,
  and the reverse holds too.

- The agent browser panel now says to tell the agent which page to work on.
  Asked to browse without naming one, it attaches to Reeve's own window rather
  than your browser tab.

- Releases are now built from a neutral path, so a package no longer carries the
  home directory of the machine that built it. The build refuses a personal path
  and the package check refuses a package containing one.

- Browser tabs now belong to a project. Reeve remembers their addresses and
  order, so reopening a project brings its pages back, still signed in.
  Switching project puts one set away and takes the other out. Terminals are
  never restored: a restored terminal would be a dead shell that looks alive.

- Clear browsing data, in Settings under Access. It removes the cookies, logins
  and cached pages behind every browser tab, and reloads any open tab so none is
  left looking signed in. The tabs share one session, so this is all of them:
  the control says so before you press it.

- A right-click menu on a browser tab: new tab to the right, reload, duplicate,
  rename, copy the address, and open it in your own browser. A tab you rename
  keeps that name as you browse, instead of the page renaming it back.

- A control in Settings under Access that lets the agent drive Reeve's browser
  tabs. It is off, and turning it on takes effect when you next start Reeve,
  because the door can only be opened as the application launches. The panel
  shows the address to give the agent, which changes every time Reeve starts,
  and it is blunt about what you are granting: the whole application window,
  not only your browsing, to anything on this computer that can reach it.
  Desktop application only.
- A Terminal tab. The panel beside a Session can now hold a real shell, opened
  from the panel's own launcher or the plus control at the end of the strip. It
  starts your own login shell in the project's directory, so your aliases,
  path and prompt are the ones you already have. Control keys reach the shell,
  the shell is told when you resize the panel, and closing the tab ends it.
  Several can run at once. A project you have not trusted is refused a shell.
  Desktop application only.
- A Browser tab. The tab strip beside a Session can now hold a web page as well
  as a file, opened from a new control at the end of the strip. Type an address
  and press Enter to go somewhere; the tab takes the page's own name, and
  follows the page as you navigate. Every browser tab shares one signed-in
  browsing session, so a login is still there in the next tab and after a
  restart. Desktop application only.

### Changed
- The Windows and Linux window draws its own title bar. The native caption
  strip and the File / Edit / View / Window strip are gone, so the application
  starts at the top of the window and the close, minimise, and maximise buttons
  sit on Reeve's own colour.
- Windows and Linux draw one menu bar above the application. It carries File,
  Edit, View and Help, the sidebar toggle, the history arrows, and the window
  buttons. Each name opens its menu.
- The main surface on Windows and Linux rounds its top left corner, where it
  meets the sidebar under the menu bar.
- The divider between the sidebar and the main surface follows that corner on
  Windows and Linux. It curves with the surface and fades where it meets the
  top edge.
- The desktop window shows Reeve's own page when it cannot load the
  application. The window showed the browser's "This page couldn't load"
  screen before. The new page names the error and offers Try again.
- A desktop build refuses to stage from a directory inside a home directory.
  Next records the build directory inside the server bundle, so such a build
  would carry the name of the person who made it. The message names a neutral
  path to build from, and names the override for a machine that has no other
  choice.
- A browser tab is now drawn by the application itself rather than embedded in
  the interface. Nothing changes in how it looks or behaves, but the agent can
  now see the page: with a debugging port open, OMP's browser tool finds the tab
  you are looking at instead of finding Reeve's own window. Browser tabs also no
  longer run as embedded guests, so the interface can no longer create one at
  all.
- The tab strip beside a Session announces itself as "Open tabs" rather than
  "Open files", and the name is translated. It is about to carry more than
  files.

### Fixed
- The test that checks the agent browser grant no longer fails on Windows.
  Windows does not carry POSIX mode bits, so the permission check ran there
  and could never pass.
- Windows no longer draws two sidebar toggles. One toggle sits on the menu bar,
  at every sidebar state.
- File, Edit, View and Help return on Windows and Linux. The keyboard shortcuts
  they carry work again, because the menu is hidden and never removed.
- The sidebar drag handle lightens the border instead of painting an accent
  line. The mark no longer stays after you release the pointer.
- Opening a drive from the Windows drive picker works. The file browser
  answered an error before, because the resolved path lost the separator
  after the drive letter.
- Windows groups the worktrees of one repository together again. Git prints a
  path with forward slashes, and Reeve compared it to a backslash path, so
  every worktree on Windows lost its identity.
- A path written with forward slashes now resolves its parent correctly on
  Windows.
- The panel beside a Session no longer stops widening part-way across a wide
  display. It now grows to the room available, less a reserve for the chat.
- The panel beside a Session is no longer empty when nothing is open. It lists
  what it can hold, which is Review, Terminal, Browser, Files and Side chat,
  each with its keyboard shortcut, and says which are not built yet. It used to
  say "No file open", which told you nothing.

### Security
- The desktop window can now host a web page guest, in preparation for a
  Browser tab. The window keeps context isolation, renderer sandboxing and
  disabled renderer Node access unchanged. Every guest has its privileges
  forced by the main process and its own requested settings discarded, so a
  page cannot ask for more than it is given, cannot nest another guest, and
  cannot choose which browsing session it reads.

## [0.5.0] - 2026-09-08 support: true

### Summary
The first public release of Reeve. Reeve is a desktop workspace for the OMP
coding agent, with the Codex desktop look, Autospawn Sans, and one shared
`~/.omp/agent` directory with the `omp` command.

### Added
- Reeve updates itself from GitHub Releases. A card in the sidebar shows the
  download and offers Restart now when the update is ready.
- A What's New dialog opens on the first launch after an update and lists every
  version since the last one you saw.
- macOS builds are signed with a Developer ID certificate and notarized by Apple.
- A Ko-fi support page and a GitHub Sponsor button on the repository.
- Settings > About shows the version, the update state, and the support links.

### Changed
- The product, package, and application identifier are Reeve and
  `com.andrewbeniston.reeve`.
- The repository is public under the MIT licence, with the upstream omp-web
  notice kept.

### Known limits
- The Windows installer is unsigned. Windows shows a SmartScreen warning on first
  run. Choose "More info" and then "Run anyway". A signing certificate follows in
  a later release.
- The Linux AppImage needs FUSE. On a machine without it, run with
  `APPIMAGE_EXTRACT_AND_RUN=1`.
- macOS Apple Silicon and Intel packages are signed and notarized.
