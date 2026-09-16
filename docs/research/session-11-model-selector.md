# Session 11. The model selector and its effort stage

Research for [#207](https://github.com/AndrewBeniston/omp-reeve/issues/207), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries the footer chip, the two-stage menu, the power slider, the effort labels, the locked-model rows, the mid-conversation warning and the model settings errors. Every value, order, threshold and timing below comes from here unless the text states another source.
- **The installed application** (version 26.908.40834). Confirms the same shipped English defaults for the model-picker strings. Nothing contradicts the extracted web bundle.
- **The extracted main-process build.** Searched for all seven string groups and for the picker identifiers. No match. This surface is renderer-side only. The main process adds nothing.

No code, markup, class names or asset bytes were copied into this repository or the issue. The document records values only.

## Table 1. States for this surface

| State | When it shows | What decides it |
|---|---|---|
| Footer chip, model and effort | The composer is idle and a model is known | The chip shows the model label, then the effort label beside it in the tertiary text colour. The effort label turns purple when the effort is the maximum step |
| Footer chip, effort only | The chip has no model prefix | The effort label takes the primary text colour |
| Footer chip, effort change animation | The effort value changes | The chip measures the new label width, then animates the width and a blur between the old and the new text. A spring curve drives the animation |
| Footer chip, chevron | Always, beside the labels | The chevron opens the menu |
| Footer chip, busy | A model change is in flight | Observed at runtime only |
| Stage 1, the slider | The menu opens | The menu opens on the compact power view |
| Stage 1, model action | The slider view is active | A control above the slider carries the accessible label "Select model" and opens stage 2 |
| Stage 1, reset control | An explicit model override exists | A 32 px round control at the start of the row. It clears the override |
| Stage 1, ultra warning | The user drags the slider to the Ultra step | The warning text replaces the reset control, which becomes hidden and inert. The text plays a 1.1 s shimmer one time |
| Stage 1, locked step | The previewed step is a locked model | The label above the slider becomes "Unlock {model}". Release opens the upgrade or credit options |
| Stage 1, keyboard control | The slider receives focus | A visually hidden control named "Power". It declares the shortcut keys Left Arrow and Right Arrow, and it wraps at both ends |
| Stage 1, keyboard announcement | The keyboard changes the step | A polite live region states the value, the position and the total. The Ultra warning follows the value when Ultra is selected |
| Stage 2, the model list | The user opens the model list | The list carries the heading "Select model" |
| Stage 2, Default row | The catalog offers a recommended set | The row label is "Default" and the second line is "Recommended set of models" |
| Stage 2, model row with check | A row matches the current model and effort | The current power selection identifier is the model slug and the effort, joined by a colon |
| Stage 2, locked row | The model is locked | The accessible label is "{model}, locked". The accessible description is "Locked, opens access options". The row opens a dialog and does not select the model |
| Stage 2, Daybreak rows | The account has Daybreak access | Separate rows switch Daybreak on and off, and disabled models explain the block |
| Stage 2, long name | A model label is longer than the row | The label clips with an ellipsis on one line |
| Stage 2, scrolling | The list is taller than the space | The list height is the smaller of 316 px and the available menu height, less the menu padding. The list then scrolls |
| Stage 2 to effort stage | The user picks a model, then adjusts its effort | The trigger placeholder becomes "Select effort". The model name sits under the effort label |
| Mid-conversation warning | The user changes the model after the conversation has turns | An information toast. An effort-only change does not raise it |
| Model settings error | The model or effort update fails | A danger toast. The configuration branch adds the validation message |
| Model retirement banner | The current model retires or has retired | A banner above the composer with a switch action and a dismiss action |
| Model name hidden | The screen is recorded and the model name is private | A placeholder replaces the name |
| Slash commands | The user types a slash command | Two entries, "Model" and "Reasoning" |

**Effort steps.** The bundle orders the reasoning efforts as none, minimal, low, medium, high, xhigh, max, ultra. The slider maps its own step names onto those values: zero to none, min to low, standard to medium, extended to high, xhigh to xhigh, max to max, and ultra to ultra. A step is marked as the maximum when the model lane is the professional lane.

**Power selections.** A step is a bundle of a model slug and a thinking effort, not a model alone. The builder takes the server slider settings and the version options, removes duplicates on the pair, and drops every Ultra step unless the Ultra setting is on or the menu is in model-selection mode. A separate setting controls this, with the label "Ultra in model picker slider" and the description "Show Ultra as the highest slider option".

**Stage transition timings.** The menu height animates over 0.32 s. The slider row and the model list fade over 0.2 s and translate over 0.32 s. The entering model list waits 40 ms, the entering slider waits 56 ms and the entering top row waits 56 ms. The leaving slider waits 16 ms and the leaving top row leaves at once. The panels move 10 px along the travel direction. A reduced-motion preference removes every transition, including the ultra warning and its shimmer.

**Sizes.** The compact view is at least 36 px high with 4 px of block padding. The control row is at least 36 px high. The toggle is at least 32 px high with a 8 px radius and 4 px of padding. The chip content is at most 64 spacing units wide. The model label uses the small text size and the medium weight. The model name under the effort uses the extra-small text size and the regular weight, in the secondary colour. The menu footer has an 8 px rule above it and 8 px of padding.

## Table 2. Shipped strings per state

All ids are in the composer namespace. The defaults are the shipped English source text.

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `composer.modelPicker.modelList.heading` | Select model | none | Section heading above the model options in the Work model picker |
| `composer.modelPicker.modelList.open.ariaLabel` | Select model | none | Accessible label for the selected-model action above the slider, which opens the list of available models |
| `composer.modelPicker.default.label` | Default | none | Option that selects among the recommended frontier models |
| `composer.modelPicker.default.description` | Recommended set of models | none | Description of the Default option |
| `composer.modelPicker.selectEffort.label` | Select effort | none | Placeholder in the trigger while the user adjusts the effort of a selected model |
| `composer.modelPicker.resetToDefault` | Reset to default | none | Accessible label and tooltip for clearing an explicit model override |
| `composer.modelPicker.power.ultraUsageWarning` | Consumes usage limits faster | none | Warning for the maximum Ultra effort. It shows for a short time under the compact slider after a drag to Ultra, and permanently as the Ultra subtitle in the effort submenu |
| `composer.modelPicker.workPower.keyboardControl.ariaLabel` | Power | none | Accessible name for the hidden Power control |
| `composer.modelPicker.workPower.keyboardControl.instructions` | Use Left and Right arrow keys to adjust power | none | Screen-reader instructions for the Power control |
| `composer.modelPicker.workPower.keyboardControl.value` | {value}, {position} of {total}. | none | Live status after a keyboard change. The value is the model and effort bundle label. The position is one-based |
| `composer.modelPicker.work.reasoning.standard.label` | Standard | none | Slider label for medium effort |
| `composer.modelPicker.work.reasoning.extended.label` | Extended | none | Slider label for high effort |
| `composer.modelPicker.lockedModel.ariaLabel` | {model}, locked | none | Accessible label for a locked model row |
| `composer.modelPicker.lockedModel.status` | Locked, opens access options | none | Accessible description. The row opens a dialog instead of selecting the model |
| `composer.modelPicker.lockedModel.unlockLabel` | Unlock {model} | none | Label above the slider while the user previews a locked model |
| `composer.modelPicker.daybreak.label` | Daybreak | none | Label for the Daybreak setting |
| `composer.modelPicker.daybreak.enable` | Turn on Daybreak | none | Accessible label for the row that turns Daybreak on |
| `composer.modelPicker.daybreak.disable` | Turn off Daybreak | none | Accessible label for the row that turns Daybreak off |
| `composer.modelPicker.daybreak.blueDescription` | For approved security work, enable Daybreak for more permissive cyber capabilities | none | Tooltip for the first Daybreak level |
| `composer.modelPicker.daybreak.redDescription` | For approved security work, enable Daybreak for more permissive cyber capabilities on general-purpose models, as well as access to specialized cyber models | none | Tooltip for the second Daybreak level |
| `composer.modelPicker.daybreak.modelDisabled` | Turn on Daybreak to use this model | none | Explanation on a disabled model row |
| `composer.modelPicker.daybreak.modelUnavailable` | Turn off Daybreak to use this model | none | Explanation on a model that Daybreak blocks |
| `composer.modelPicker.daybreak.saveFailed` | Could not save Daybreak preference | none | Toast when the save fails |
| `composer.modelSettings.errorGeneric` | Couldn’t update model settings | none | Error when the update fails for a reason other than authentication |
| `composer.modelSettings.errorConfigValidation` | Couldn’t update model settings. Check your config.toml.{br}{br}{message} | none | Error when the update fails because the configuration is invalid |
| `composer.modelSettings.updateError` | no text | none | A toast identifier only. It carries no default message. The text comes from the two errors above |
| `composer.modelSlashCommand.title` | Model | none | Title for the model slash command |
| `composer.modelSlashCommand.matchingModels.title` | Matching models | none | Heading for catalog matches below recent configurations |
| `composer.reasoningSlashCommand.title` | Reasoning | none | Title for the reasoning slash command |
| `composer.modelChangeDuringConversationWarning.toast` | Changing models mid-conversation will degrade performance | none | Warning toast on a model change during a conversation |
| `composer.modelChangeDuringConversationWarning.v2.toast` | Changing models mid-conversation will degrade performance. Start a new session for the best experience, or switch back to {previousModel}. | none | The second version of the same warning. The previous model is the model the user leaves |
| `composer.modelDisplayName.hiddenWhileRecording` | Model name hidden while screen recording | none | Accessible label for the placeholder that hides a private model name |
| `composer.modelUpgradeBanner.title` | {model} is retiring | none | Title of the retirement banner |
| `composer.modelUpgradeBanner.titleWithRetirementDate` | {model} retires on {retirementDate} | none | Title with the localized retirement date |
| `composer.modelUpgradeBanner.retiredTitle` | {model} was retired | none | Title after the deadline passes |
| `composer.modelUpgradeBanner.description` | This conversation will automatically switch to {model} | none | Description of the banner |
| `composer.modelUpgradeBanner.switchNow` | Switch now | none | Button that switches the conversation to the replacement model |
| `composer.modelUpgradeBanner.dismiss` | Dismiss model upgrade banner | none | Accessible label for the dismiss action |

Adjacent strings that this surface uses, recorded because a later search will meet them.

| Id | Default | Note |
|---|---|---|
| `composer.mode.local.reasoning.none.label` | None | Effort label |
| `composer.mode.local.reasoning.minimal.label` | Minimal | Effort label |
| `composer.mode.local.reasoning.low.label.v2` | Light | Effort label. The description states that Light means a low effort, not a short time |
| `composer.mode.local.reasoning.medium.label` | Medium | Effort label |
| `composer.mode.local.reasoning.high.label` | High | Effort label |
| `composer.mode.local.reasoning.xhigh.label` | Extra High | Effort label |
| `composer.mode.local.reasoning.max.label` | Max | Effort label |
| `composer.mode.local.reasoning.ultra.label` | Ultra | Effort label |
| `composer.mode.local.reasoning.persistent.label` | Persistent | A mode that continues the agent until the user pauses it |
| `composer.intelligenceDropdown.lockedModel.effortTooltip.v2` | {supportsPersistent, select, true {Reasoning levels other than Persistent have no effect on this agent} other {Reasoning levels have no effect on this agent}}. Ultra adds instructions to use subagents proactively | A select rule on the persistent capability |
| `settings.agent.modelFeatures.modelPickerSliderUltra.label` | Ultra in model picker slider | Setting that adds the Ultra step |
| `settings.agent.modelFeatures.modelPickerSliderUltra.description` | Show Ultra as the highest slider option | Setting description |
| `settings.agent.modelFeatures.modelPickerSliderUltra.ariaLabel` | Show Ultra in the model picker slider | Setting toggle label |
| `codex.command.composer.increaseReasoningEffort` | Increase reasoning effort | Command title |
| `codex.command.composer.decreaseReasoningEffort` | Decrease reasoning effort | Command title |
| `codex.command.composer.cycleReasoningEffort` | Cycle reasoning effort | Command title |
| `codex.commandDescription.composer.increaseReasoningEffort` | Increase the current composer reasoning effort | Command description |
| `codex.commandDescription.composer.decreaseReasoningEffort` | Decrease the current composer reasoning effort | Command description |
| `codex.commandDescription.composer.cycleReasoningEffort` | Cycle through composer reasoning effort options | Command description |

## Table 3. The OMP or Reeve source per state

Read from the composer component, the model role helpers and the model scope helper on this branch.

| Reference state | Reeve's nearest surface | OMP or Reeve source |
|---|---|---|
| Footer chip, model and effort | The composer model control shows an icon, the model name and the effort label, then a chevron | The model comes from the session state. The effort label comes from the thinking level and its label map |
| Footer chip, effort change animation | none | no source. The label changes at once |
| Footer chip, busy | The control shows a spinner, sets the busy state and the tooltip "Switching model" | The model-switching flag in the composer |
| Stage 1, the slider | none. The first stage is a list of rows: Model, Effort, Speed and Advanced. Each row shows its current value and opens a submenu | The row list in the composer |
| Stage 1, model action | The Model row opens the model submenu | The same row list |
| Stage 1, reset control | none | no source. An explicit model pick is written to the default role, and nothing clears it from the composer |
| Stage 1, ultra warning | The Effort submenu shows "Consumes usage limits faster" under the highest level | The warning is bound to the level named max |
| Stage 1, locked step | none | no source. OMP has no locked models and no upgrade path |
| Stage 1, keyboard control | Shift and Tab cycle the effort level while no menu is open. The menus use radio rows | The cycle handler in the composer and the cycle command in the session hook |
| Stage 1, keyboard announcement | none | no source. No live region states the new value |
| Stage 2, the model list | The model submenu lists the roles, then all models, grouped by provider | The model list from the models endpoint and the role list from the model role helper |
| Stage 2, Default row | The Roles group. OMP's default role is the nearest match to the Default option | The model roles record in the OMP configuration. The role row shows the resolved model and its pinned thinking level |
| Stage 2, model row with check | The active row carries the radio state and a check | The comparison of the provider and the model identifier |
| Stage 2, locked row and Daybreak | none | no source |
| Stage 2, long name | The row label clips with an ellipsis | The composer styles |
| Stage 2, scrolling | The menu scrolls. The height is the smaller of the space above the control and 60 percent of the viewport, and at least 120 px | The composer floating geometry |
| Stage 2, filter | A filter field above the list. The reference has no filter on this surface | The composer filter state |
| Stage 2 to effort stage | The Effort submenu is a separate row, not a second stage of the same control | The submenu state |
| Mid-conversation warning | none | no source |
| Model settings error | The composer shows a model error and the model scope warnings | The models endpoint and the model scope helper |
| Model retirement banner | none | no source |
| Model name hidden | none | no source |
| Slash commands | The built-in slash commands are compact, reload, name, session and copy. There is no model command and no reasoning command | The built-in command list in the composer |

**How OMP's roles and thinking levels map onto the reference.** OMP assigns one model to each role: default, smol, slow, vision, plan, designer, commit, tiny, task and advisor. The reference has one Default option and one recommended set. The two ideas are not the same. OMP picks a model by the scope of the work. The reference picks a model by the recommended set, then adjusts one effort. OMP's default role is the only role that the reference's Default option matches.

OMP's thinking levels are inherit, off, auto, minimal, low, medium, high, xhigh and max. The reference's efforts are none, minimal, low, medium, high, xhigh, max and ultra. Seven values agree: minimal, low, medium, high, xhigh and max, plus none against off. OMP has no ultra step and no persistent step. The reference has no auto step and no inherit step.

The labels differ at the top. Reeve labels the level named max as "Ultra". The reference labels max as "Max" and keeps "Ultra" for a separate, higher step. Reeve also attaches the usage warning to max, while the reference attaches it to ultra.

A thinking level can also arrive from the model scope. A scope pattern with a colon suffix pins a level on every model that the pattern matches. The reference has no equivalent.

## Parity checklist

**Matches**

- Both show the model name and the effort together in one composer control, with a chevron.
- Both mark the active model and the active effort with a check in a radio list.
- Both name the effort levels with the same words for minimal, light, medium, high and extra high.
- Both ship the same usage warning text, although they attach it to a different step.
- Both offer a keyboard path to change the effort without the pointer.
- Both group the model list and scroll it when the list is too tall.
- Both show a busy state while a model change is in flight.

**Lacks**

- No slider. Reeve has no power control, no steps, no dots and no thumb.
- No power selections. Reeve selects a model and an effort separately. The reference bundles the pair into one step.
- No Default row with the text "Recommended set of models".
- No reset control to clear an explicit model override.
- No locked models, no unlock action and no access dialog.
- No mid-conversation warning after a model change.
- No model slash command and no reasoning slash command.
- No model retirement banner.
- No hidden model name during a screen recording.
- No live region that announces the new effort, its position and the total.
- No two-stage transition, so none of the reference timings apply.

**Differs**

- The reference opens on the slider and treats the model list as the second stage. Reeve opens on a row list and treats both the model and the effort as submenus.
- The reference has one Default option. Reeve has ten roles, and the role decides the model by the scope of the work.
- Reeve labels the level named max as "Ultra". The reference keeps that word for a higher step.
- Reeve adds a model filter field. The reference has none on this surface.
- Reeve adds a Speed row and a tool preset section. The reference has a fast-mode toggle in the same area, but no tool preset.
- The reference animates the effort label width with a blur. Reeve replaces the text at once.
- The reference bounds the model list at 316 px. Reeve bounds the menu at 60 percent of the viewport height.

## What only a live run can settle

- The exact time that the ultra warning stays under the compact slider after a drag, and whether a second drag restarts it.
- Whether the footer chip shows a spinner or another indicator while the model change is in flight.
- The drag behaviour of the slider thumb, the appearance of the filled and unfilled dots, and the snap behaviour between steps.
- Whether the mid-conversation warning appears one time for each conversation or one time for each change.
- The tab order through the menu, and whether the focus returns to the chip after the menu closes.
- Whether the reduced-motion path removes the chip blur as well as the menu transitions.
- The rendered order of the model rows, because the server supplies the slider settings and the version options.

