# Session inputs without settled OMP sources

Research for [#316](https://github.com/AndrewBeniston/omp-reeve/issues/316), within the [Session view map](https://github.com/AndrewBeniston/omp-reeve/issues/194).

This document records verified facts separately from recommendations.

## Plain-English glossary

| Feature name | What a person does with it |
|---|---|
| Voice chat | The person speaks with the assistant instead of typing each message. |
| Add remote files | The person selects files from the computer that will run the task. |
| Sketch | The person draws a quick picture and adds it to the message. |
| Attach appshot | The person captures an application window and adds the image to the message. |
| Pull-request attachment | The person adds one pull request as working context. |
| Shared-chat attachment | The person adds a shared conversation as working context. |
| Browser-annotation attachment | The person marks part of a web page and adds that selection to the message. |
| Apps | The person gives the assistant access to a connected service. |
| Sites | The person references or creates a hosted site from the message. |
| ChatGPT conversations | The person adds an earlier ChatGPT conversation as working context. |
| Plan mode | The person asks for an approved plan before implementation starts. |
| Goal mode | The person gives the assistant an outcome to pursue across several turns. |
| Custom permissions | The person selects a saved set of approval rules. |
| Managed permissions | An organisation sets approval rules that the person cannot change. |
| Remote run location | The person runs the task on another connected computer. |
| Cloud run location | The person runs the task in a hosted environment. |
| Locked models and unlock access | The person sees an unavailable model and opens the access choices. |
| Model retirement | The person sees that the current model will become unavailable. |
| Hidden model names during screen recording | The person hides a private model name while recording the screen. |
| Daybreak | The person enables an account-controlled security research mode. |

## Verified facts

The extracted renderer bundle contains visible states for all listed reference features.

The extracted main-process build contains commands for voice chat and appshot capture.

The existing Session research records the visible labels and state transitions.

Reeve accepts image content and already renders image attachments.

Reeve also reads local files and folders through file mentions.

Reeve has GitHub pull-request data in the Review panel.

Reeve has an in-application browser, but it has no browser-annotation composer source.

Reeve lists OMP plugins, skills, live agents, and slash commands in the composer.

Current Reeve source contains OMP Plan mode state and plan approval operations.

The earlier Composer audit predates those Plan mode operations.

OMP model roles include a Plan role.

Current OMP has a complete Goal runtime with objective, status, optional token budget, real token usage, elapsed time, pause, resume, completion, persistence and continuation.

Reeve now reads and changes the real OMP approval mode.

The completed source checks found no Reeve source for voice chat, Goal mode, or Daybreak.

OMP has three approval modes and per-tool approval rules. It has no named custom permission profiles.

OMP SSH can run remote commands and move remote text files. It does not move a complete Session to another host.

OMP's catalog includes Daybreak Blue and Daybreak Red models. It has no separate Daybreak entitlement switch.

OMP has provider-level credential locks and login actions. It has no model-level unlock action.

OMP has no structured model-retirement metadata. Discovery removes hidden Codex models instead of marking them.

OMP has no setting that hides model names during screen recording.

The reference's remote-file attachment carries a host path, filename label and filesystem path.

The reference's shared-chat attachment carries a `shareId` as shared-thread metadata.

The reference's browser annotation carries page, frame, target, selection, screenshot and comment context.

The reference's appshot carries a screenshot, accessibility text, application name, application identifier and optional window title.

The reference's Sketch becomes a PNG image attachment.

The reference's pull-request attachment adds extracted text to the selected-text prompt section.

## Comparison and recommendation

The first three columns contain verified facts from the completed checks.

The final three columns contain estimates and recommendations.

`S` means one focused ticket. `M` means two to four tickets. `L` means one small epic.

`XL` means a new OMP capability and a Reeve epic.

| What the user sees | One simple example | Does OMP already have the required source? | Smallest honest Reeve choice | Estimated ticket size | Recommendation |
|---|---|---|---|---|---|
| Voice chat shows a voice control and opens a spoken conversation. | A person discusses a bug while reading its logs. | No OMP voice-session source was verified. | Omit it and record the missing voice contract. | XL. | Wait for an OMP real-time audio contract. |
| Add remote files opens a picker on the selected execution computer. | A person attaches a server log without copying it locally. | Partial. OMP SSH can run remote commands and move remote text files, but it cannot move the complete Session to that host. | Offer remote-file actions only for an explicitly configured SSH host. Do not label the Session itself remote. | M. | Build remote-file selection after Reeve has a clear SSH-host selector. |
| Sketch opens a drawing surface and attaches the result as an image. | A person circles the desired control position. | Yes. The reference emits a PNG, and OMP already carries image content. | Build a Reeve drawing surface on the image attachment path. | M. | Build it only when design work justifies the editor cost. |
| Attach appshot captures an application and attaches the result as an image. | A person shows a dialog that needs repair. | Yes for the payload. The reference sends the screenshot, accessibility text, app identity and optional window title. OMP carries image and text content. | Build capture, consent and permission handling in the desktop shell. | M. | Build this before Sketch because it helps diagnosis directly. |
| A pull-request chip identifies one pull request in the composer. | A person asks the assistant to fix review comments. | Partial. The reference adds extracted pull-request text to the selected-text prompt section. Reeve already has pull-request data; OMP needs no new attachment type. | Add bounded, labelled text context from Reeve's pull-request source. | M. | Build a Reeve attachment without adding an OMP data type. |
| A shared-chat chip identifies one shared conversation. | A person asks the assistant to continue advice from a shared link. | No. The reference sends a `shareId`, while OMP has no trusted shared-chat importer. | Omit it and record the missing importer. | L. | Wait for a safe import contract and provenance rules. |
| A browser annotation shows the selected page region. | A person marks the price that a scraper missed. | Partial. The reference sends page, frame, target, selection, screenshot and comment context. OMP can carry the resulting text and image, but Reeve has no annotation source. | Build it from Reeve's browser after browser selection exists. | L. | Keep it in the Browser epic. |
| Apps appear as connected services in search and message context. | A person lets the assistant read a calendar. | OMP already exposes MCP servers and plugins for this purpose. | Use OMP plugin names and permissions. | M. | Do not add a second Apps category. |
| Sites appear as hosted web projects that the person can reference. | A person asks the assistant to update a published landing page. | No OMP Sites service was verified. | Omit it and name the missing hosting service on the map. | XL. | Add it only with a provider-neutral hosting contract. |
| ChatGPT conversations appear as earlier conversations that can attach. | A person adds an earlier design discussion to the current task. | OMP session files contain conversations, but no attachment action was verified. | Build a Reeve Session reference with a bounded transcript summary. | M. | Name the feature Sessions because that is the OMP object. |
| Plan mode shows a Plan indicator before implementation starts. | A person approves an approach before code changes begin. | Yes. Current Reeve source uses OMP Plan mode and approval operations. | Expose the existing Plan state in the composer. | M. | Build this from the current OMP contract. |
| Goal mode shows an objective, status, time, budget, and controls. | A person asks the assistant to finish a migration across many turns. | Yes. Current OMP owns the Goal object, optional token budget, hard budget state, continuation, persistence and controls. | Expose OMP Goal Mode in Reeve without a second store or loop. | L. | Build Reeve Epic #318 at reference parity. |
| Custom permissions appear as a selectable saved approval profile. | A person permits tests but requires approval for network access. | Partial. OMP has three approval modes and per-tool approval rules, but no named saved profiles. | Build an OMP-backed editor for per-tool rules before showing a Custom row. | M. | Do not display Custom until the editor writes real OMP rules. |
| Managed permissions appear as fixed organisation rules. | A company blocks external network access for every task. | No organisation policy source was verified. | Omit it and record the missing policy authority. | XL. | Wait for an OMP policy and provenance contract. |
| Remote run location selects another connected computer. | A person runs a large test on a stronger computer. | Partial. OMP SSH runs remote commands and moves remote text files, but it does not relocate the Session. | Keep the Session location local and label SSH actions separately. | L for full remote Sessions. | Design Session host identity before adding this control. |
| Cloud run location selects a hosted execution environment. | A person starts a clean build without using the local computer. | No OMP cloud-environment source was verified. | Omit it and explain that no cloud target exists. | XL. | Wait for a provider-neutral execution contract. |
| Locked model rows open access choices instead of selecting the model. | A person opens subscription choices for an unavailable model. | Partial. OMP has provider-level credential locks and login actions, but no model-level unlock action. | Link unavailable models to the real provider login. Never promise model-level access. | M. | Use provider availability, not a copied commercial lock state. |
| A retirement banner gives a replacement action and a dismissal. | A person switches before the current model becomes unavailable. | No. OMP has no structured retirement date or replacement metadata. | Omit it and record the missing lifecycle metadata. | M after catalog support exists. | Add lifecycle metadata to the OMP catalog first. |
| A placeholder replaces the model name during screen recording. | A person records training material without revealing a private model. | No. OMP removes hidden Codex models during discovery and has no screen-recording privacy setting. | Add an explicit Reeve privacy setting before automatic detection. | S. | Build a manual hide-model-names setting if users request it. |
| Daybreak rows enable or disable account-controlled security capabilities. | An approved security researcher selects a specialised model. | Partial. OMP's catalog contains Daybreak Blue and Daybreak Red models, but no separate Daybreak entitlement switch. | Show the models only when OMP discovery returns them. Do not add a copied Daybreak toggle. | S. | Let provider discovery decide availability. |

## Grouped maintainer questions

1. Should Reeve build Appshot before Sketch, using the existing image path?
2. Should Reeve call prior-conversation attachments Sessions and summarise them before sending?
3. Should Reeve expose current OMP Plan mode in the Composer epic?
4. Should Reeve build a Custom permissions editor over OMP's per-tool rules?
5. Should Reeve add a manual hide-model-names setting?
6. Should Reeve expose remote-file actions for configured SSH hosts while keeping Sessions local?
7. Should provider-specific rows remain absent unless OMP discovery returns the required state?
