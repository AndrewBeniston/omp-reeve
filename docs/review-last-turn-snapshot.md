# The last-turn snapshot contract

Review's **Last turn** scope answers one question: what did the agent's most
recent prompt leave behind? This document states what that answer means, what
it deliberately does not mean, and what Review says when it cannot answer at
all. It is the contract the code in `lib/review-turn-*.ts` keeps.

## Provenance comes from recorded events, never from HEAD

A prompt's interval is bounded by two moments Reeve recorded while the prompt
ran: the workspace as it stood when the prompt opened, and the workspace as it
stood when the prompt ended. Both are captured as Git tree objects in a private
store under the agent directory, and the patch is the difference between those
two trees.

Nothing in that path consults `HEAD`, the index, or the working tree at read
time. This is the whole point of the design, and it has four consequences a
reader can rely on:

- **Work already in the tree is excluded.** A file a person edited by hand
  before the prompt began is in the before tree and in the after tree, so it
  cancels. A diff against `HEAD` would have shown it as the agent's work.
- **Committing afterwards changes nothing.** Committing moves `HEAD`; it does
  not move either recorded tree. The last turn reads the same after the commit
  as before it.
- **Reverting afterwards changes nothing.** Putting the files back leaves both
  recorded trees standing. The turn still shows what the agent did, which is
  the honest answer to what the turn did.
- **A later prompt does not rewrite an earlier answer.** Each run owns its own
  store and its own record.

## Only the agent's work, or no answer

**Last turn** shows the agent's most recent turn and nothing else. A pair of
trees cannot do that alone: it says what moved between two moments, not who
moved it. The run's own tool executions say the rest. The SDK raises
`tool_execution_start` and `tool_execution_end` for every tool, carrying its
arguments and its result, and those are recorded beside the span.

A file is the run's work only where its final bytes are known from the tool
itself and the interval ends on exactly those bytes.

- `write` is given the whole file as `content`, so what it leaves follows
  from its arguments. Nothing is required of the prior state: the file is
  replaced whole, so nothing of anyone else's survives into it.
- `edit` reports `oldText` and `newText` as whole-file snapshots, with
  `sourcePath` and `move` for a rename. Because it keeps most of the file,
  the `oldText` it reports must match what this run last left there —
  otherwise somebody's save is already inside what the tool wrote, and the whole
  file would read as the run's work.
- A failed tool establishes nothing. Crediting it because the bytes happen to
  match would be the same mistake as trusting disk.

A move is treated as one fact rather than two paths. If the file it came from
no longer holds what the run left there, somebody else's text is inside what was
moved, so neither the source nor the destination is claimed — even though nothing
was required of the destination on its own. The same holds when a path cannot be
placed in the repository at all: a move names its source wherever it sat, and a
source outside the repository cannot be checked, so it takes its group with it
rather than letting the destination stand alone.

Nothing in this path reads the working tree. Disk holds whatever anybody wrote,
and an observation of it races the tool it is meant to describe: the SDK emits
the start event and then awaits the tool, so a reader arriving afterwards
describes the result, not the starting point. Every comparison here is between
hashes the tools themselves reported and the hashes in the recorded trees. A
second edit to one file is held against the bytes the first edit reported, never
against the file as it stands now.

Anything else that changed in the interval is left out of the patch and named in
`unattributedPaths`. Naming matters: a file that changed and is silently
missing from a patch reads as a file that did not change.

## A turn shown in part

A tool that may have written without saying where — a shell, a subagent, a
plugin nobody has checked — is a gap in coverage, not grounds to disbelieve what
other tools proved. The shell is the agent too, so what it did is missing
evidence rather than somebody else's work. Those tools are named in
`incompleteTools`, the tools that can be followed still show their files, and
the reader is told the turn is shown in part.

The only whole refusal left is a turn with no record at all — one recorded
before any of this was kept. An empty patch would read as a prompt that changed
nothing, which is a claim rather than an absence.

A record carries the version of the rules it was written under. A record from
an older Reeve, or one that is not shaped like a record, is refused rather than
read: its writes were established under rules this version no longer applies,
and reading it as though they were the same would either fail on a missing field
or quietly trust what was never verified.

Three limits are worth stating. An `edit` that exceeds the SDK's 32k snapshot
budget arrives with `snapshotsPruned` set and no text, so those paths go
unattributed and the tool is named as a gap even where its other files were
proved — otherwise a turn with an unaccounted change would report no gaps. Content hashes are computed the way Git computes them with SHA-1,
so a repository using another hash matches nothing and every path falls to
unattributed, which is the safe direction. And recording stops keeping up past
2000 files in one turn, which is reported as a gap like any other.

The interval draws no line between tracked and untracked files. A file the
prompt created is simply a file the later tree has.

## When Review refuses to answer

A snapshot that cannot be trusted is refused, never rendered as an empty diff.
An empty diff reads as "the prompt changed nothing", which is a different claim
and frequently a false one. Each refusal carries its own reason, and each reason
has its own message in the panel and in the API:

| Reason | What happened |
|---|---|
| `in-progress` | The prompt is still running, so it has no end state yet. This is the only retryable reason. |
| `no-record` | No snapshot exists for this Session: none was taken, or retention has collected it. |
| `session-mismatch` | The Session does not belong to the directory or the repository the request is standing in. |
| `unsettled` | The run never reported a terminal end, or the process recording it stopped. No end state was taken. |
| `not-a-repository` | The Session's directory is not inside a Git repository. |
| `budget-exceeded` | The workspace was too large, or took too long, to snapshot while the prompt ran. |
| `capture-failed` | The snapshot could not be taken. |
| `store-unavailable` | The private store could not be created or written. |
| `baseline-missing` | A recorded tree is no longer readable in the store. |
| `attribution-unavailable` | Nothing was recorded about what this run did, so its work cannot be separated from anyone else's. A turn recorded before this was kept lands here. |

A turn whose patch is larger than one read refuses as `diff-too-large`, the
same typed reason, message, and 413 the other Git-backed scopes give, carrying
the shared per-diff cap rather than a limit of its own. It is raised rather than
returned, because that reason belongs to the Git-read union the route already
answers from, and it leaves the turn-layer reasons unchanged.

A capture that succeeded but could not represent particular files faithfully —
a symlink, a file under a filter driver, a file whose line endings Git would
convert — names those paths in `skippedPaths` rather than dropping them. Their
absence from the patch is not evidence they did not change.

## Ownership and access

A read names a Session and a directory. It never names a tree or a store. The
Session's own file says which directory it belongs to; the record on disk says
which repository and which trees. A request that disagrees with either is
refused with `session-mismatch`, so one Session cannot be used to read
another's work, and an invented Session identifier reaches no record at all.

## Costs a prompt never pays

Capturing is subordinate to the prompt. A capture that fails, a directory
outside a repository, or a workspace over budget records why it has nothing
rather than failing the prompt or recording nothing at all. Capture runs no
code the project configured: clean filters, textconv programs, and a configured
file-system monitor are all disabled on every command pointed at the project.

Snapshots are bounded by dropping whole stores, after a prompt has closed and
never on its way in. A store whose owning process may still be writing into it
is never collected.
