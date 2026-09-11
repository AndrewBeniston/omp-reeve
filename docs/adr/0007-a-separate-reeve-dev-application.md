---
status: proposed
---

# A separate Reeve Dev application, so a test build never touches the release

Andrew asked on 2026-09-10 how to test a build on a Windows machine without
losing the working Reeve on that machine, and how to test the update path the
way a person online sees it. ADR-0006 decided the update channel. It did not
decide how a test build and the release live side by side.

## The problem

Today they cannot. A packaged build and the installed release collide three
times on one machine.

1. They share the application identifier `com.andrewbeniston.reeve`, so the
   Windows installer replaces one with the other.
2. They share the settings directory, `omp-desktop` under the user's
   application data. `main.cjs` sets that path by name. Sessions, theme, and
   the password lock all live there, so a test build writes into real data.
3. They share the port `30142`. `desktop-runtime.cjs` fixes that number, and
   the second application to start finds the port taken.

A person who wants to try a change therefore has to give up the working copy.

## Decision

Package Reeve under two identities from one source tree. The build chooses the
identity, and nothing in the application code branches on it.

| | Reeve | Reeve Dev |
| --- | --- | --- |
| Application identifier | `com.andrewbeniston.reeve` | `com.andrewbeniston.reeve.dev` |
| Product name | Reeve | Reeve Dev |
| Settings directory | `omp-desktop` | `omp-desktop-dev` |
| Port | 30142 | 30143 |
| Update feed | its own platform feed, see ADR-0013 | none |

Both appear in the Start menu at once. Neither can damage the other.

`desktop/targets.json` already owns every supported target, so the identity
belongs beside it rather than in a second configuration file.

Reeve Dev does not update itself. It is replaced by installing a newer one. An
updater on a test build would fetch the release feed and downgrade the tester
to the public version, which is the opposite of what a tester wants.

## The two paths this creates

A test build goes to Reeve Dev. It may be broken. It never reaches a user, and
it never touches the release on the same machine.

A release goes to Reeve. A tag publishes the installer and `latest.yml` to
GitHub Releases. Every installed copy sees the new version, downloads it in the
background, and shows the sidebar card from DESIGN.md 15.1.

The maintainer can therefore hold both on one machine: a working Reeve that
updates like any published application, and a Reeve Dev that carries the change
under test.

## Testing the update path

The update path needs its own test, because a person online sees it and the
maintainer does not. Install a release one version behind. Publish the next
version. Watch the card appear, the download finish, and `Restart now` load the
new version. That test needs the real feed, so it runs against a real release,
not a draft.

## Consequences

The installed Reeve on a maintainer's machine survives every test build.

Two icons and two Start menu entries exist on a maintainer's machine. That cost
is accepted: it is what makes the release safe.

A Reeve Dev build carries no update feed, so a stale test build stays stale. The
name says Dev, which is the warning.

The Windows installer stays unsigned, so both identities show the SmartScreen
warning on first run. ADR-0006 defers Windows signing, and this decision does not
change that.

Nothing here changes the release channel. ADR-0006 still owns it: one stable
channel, a check on launch and every four hours, and a background download.
