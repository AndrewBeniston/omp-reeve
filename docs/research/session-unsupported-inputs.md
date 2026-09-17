# Session inputs without settled OMP sources

Research for [#316](https://github.com/AndrewBeniston/omp-reeve/issues/316), within the [Session view map](https://github.com/AndrewBeniston/omp-reeve/issues/194).

This document records verified facts separately from recommendations.

The 100,000-token research goal reached its limit before every OMP package check finished.

The final section lists the remaining checks.

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

The existing Goal research found no OMP goal object, status, budget, or continuation loop.

Reeve now reads and changes the real OMP approval mode.

The completed source checks found no Reeve source for voice chat, Goal mode, or Daybreak.

The completed source checks found no Reeve source for remote or cloud execution.

The completed source checks found no Reeve source for model retirement or recording privacy.

## Comparison and recommendation

The first three columns contain verified facts from the completed checks.

The final three columns contain estimates and recommendations.

`S` means one focused ticket. `M` means two to four tickets. `L` means one small epic.

`XL` means a new OMP capability and a Reeve epic.

| What the user sees | One simple example | Does OMP already have the required source? | Smallest honest Reeve choice | Estimated ticket size | Recommendation |
|---|---|---|---|---|---|
| Voice chat shows a voice control and opens a spoken conversation. | A person discusses a bug while reading its logs. | No OMP voice-session source was verified. | Omit it and record the missing voice contract. | XL. | Wait for an OMP real-time audio contract. |
| Add remote files opens a picker on the selected execution computer. | A person attaches a server log without copying it locally. | No OMP remote-host file source was verified. | Omit it and explain that Reeve runs locally. | L after remote execution exists. | Keep local files under the existing Files and folders action. |
| Sketch opens a drawing surface and attaches the result as an image. | A person circles the desired control position. | OMP already carries image content. | Build a Reeve drawing surface on the image attachment path. | M. | Build it only when design work justifies the editor cost. |
| Attach appshot captures an application and attaches the result as an image. | A person shows a dialog that needs repair. | OMP already carries image content. | Build capture and permission handling in the desktop shell. | M. | Build this before Sketch because it helps diagnosis directly. |
| A pull-request chip identifies one pull request in the composer. | A person asks the assistant to fix review comments. | Reeve has pull-request data, but OMP has no specialised attachment. | Add stable text context from Reeve's existing pull-request source. | M. | Build a Reeve attachment without adding an OMP data type. |
| A shared-chat chip identifies one shared conversation. | A person asks the assistant to continue advice from a shared link. | No importer or trusted shared-chat source was verified. | Omit it and record the missing importer. | L. | Wait for a safe import contract and provenance rules. |
| A browser annotation shows the selected page region. | A person marks the price that a scraper missed. | OMP can carry text and images, but no annotation source exists. | Build it from Reeve's browser after browser selection exists. | L. | Keep it in the Browser epic. |
| Apps appear as connected services in search and message context. | A person lets the assistant read a calendar. | OMP already exposes MCP servers and plugins for this purpose. | Use OMP plugin names and permissions. | M. | Do not add a second Apps category. |
| Sites appear as hosted web projects that the person can reference. | A person asks the assistant to update a published landing page. | No OMP Sites service was verified. | Omit it and name the missing hosting service on the map. | XL. | Add it only with a provider-neutral hosting contract. |
| ChatGPT conversations appear as earlier conversations that can attach. | A person adds an earlier design discussion to the current task. | OMP session files contain conversations, but no attachment action was verified. | Build a Reeve Session reference with a bounded transcript summary. | M. | Name the feature Sessions because that is the OMP object. |
| Plan mode shows a Plan indicator before implementation starts. | A person approves an approach before code changes begin. | Yes. Current Reeve source uses OMP Plan mode and approval operations. | Expose the existing Plan state in the composer. | M. | Build this from the current OMP contract. |
| Goal mode shows an objective, status, time, budget, and controls. | A person asks the assistant to finish a migration across many turns. | No. The verified Goal research found no OMP goal object. | Build an OMP goal source before the Reeve interface. | XL. | Create one OMP goal epic and one dependent Reeve epic. |
| Custom permissions appear as a selectable saved approval profile. | A person permits tests but requires approval for network access. | OMP approval modes exist, but saved custom profiles remain unverified. | Show only the approval modes that OMP returns. | M if OMP adds profiles. | Do not display Custom until OMP names a real profile. |
| Managed permissions appear as fixed organisation rules. | A company blocks external network access for every task. | No organisation policy source was verified. | Omit it and record the missing policy authority. | XL. | Wait for an OMP policy and provenance contract. |
| Remote run location selects another connected computer. | A person runs a large test on a stronger computer. | No OMP execution-host source was verified. | Omit it and explain that execution is local. | XL. | Design host identity before adding the control. |
| Cloud run location selects a hosted execution environment. | A person starts a clean build without using the local computer. | No OMP cloud-environment source was verified. | Omit it and explain that no cloud target exists. | XL. | Wait for a provider-neutral execution contract. |
| Locked model rows open access choices instead of selecting the model. | A person opens subscription choices for an unavailable model. | OMP exposes configured models and credentials, but no commercial lock state was verified. | Show provider availability reasons without an unlock action. | M. | Never imply that Reeve can grant model access. |
| A retirement banner gives a replacement action and a dismissal. | A person switches before the current model becomes unavailable. | No retirement date or replacement source was verified. | Omit it and record the missing lifecycle metadata. | M after catalog support exists. | Add lifecycle metadata to the OMP catalog first. |
| A placeholder replaces the model name during screen recording. | A person records training material without revealing a private model. | No recording-state source or privacy setting was verified. | Add an explicit Reeve privacy setting before automatic detection. | S. | Build a manual hide-model-names setting if users request it. |
| Daybreak rows enable or disable account-controlled security capabilities. | An approved security researcher selects a specialised model. | No OMP Daybreak entitlement source was verified. | Omit it and record that it is provider-specific. | XL. | Do not copy an account policy that OMP cannot enforce. |

## Grouped maintainer questions

1. Should Reeve build Appshot before Sketch, using the existing image path?
2. Should Reeve call prior-conversation attachments Sessions and summarise them before sending?
3. Should Reeve expose current OMP Plan mode in the Composer epic?
4. Should Goal mode begin as a new OMP epic?
5. Should Reeve add a manual hide-model-names setting?
6. Should all provider-specific or host-specific rows remain omitted until OMP provides contracts?

## Remaining verification

The token limit prevented a complete read of the installed application archive.

The token limit also prevented a complete OMP package search.

The next pass must verify Custom permission profiles against current OMP source.

The next pass must verify model lifecycle metadata against the current OMP catalog.

The next pass must verify whether OMP exposes any execution-host abstraction.

The next pass must verify the exact prompt payload for each reference attachment.

The recommendations remain provisional where the OMP source column says that verification was incomplete.
