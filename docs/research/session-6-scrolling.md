# Session 6. Scrolling and anchoring

Research for [#200](https://github.com/AndrewBeniston/omp-reeve/issues/200), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries the thread scroll layout, the scroll-to-bottom button, the follow-mode state machine, the response spacer and the history auto-load rule. Every threshold, duration and easing below comes from here unless stated otherwise.
- **The installed application** (version 26.908.40834). Carries the same English default and the same description for the one shipped string of this surface, plus 64 translated tables for it. It also carries the same follow-mode names. Nothing contradicts the extracted web bundle.
- **The extracted main-process build.** Searched for the string id, for the thread scroll identifiers, for the follow-mode names and for the anchoring properties. No match. This surface is renderer-side only. The main process contributes nothing.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Table 1. States for this surface

| State | When it shows | What decides it |
|---|---|---|
| Pinned to the end | The reader sits within 24 px of the end | Distance from the end <= 24 px |
| Detached | The reader sits more than 24 px from the end | Distance from the end > 24 px |
| Scroll-to-bottom button hidden | Pinned, or the response spacer still covers the gap | Distance <= 24 px, or distance <= spacer height + 24 px |
| Scroll-to-bottom button shown | Detached beyond that band | Distance > 24 px, or distance > spacer height + 24 px |
| Scroll-to-bottom button with working dots | The button shows and the turn is still working | Button shown AND the working flag |
| Follow mode: static | No run, or the reader left the end after the final answer started | Reducer state `static` |
| Follow mode: prework watch | A turn is in the prework phase and the reader is not following | Reducer state `prework_watch` |
| Follow mode: prework follow | The prework content overflows the viewport, or the reader was following when prework started | Reducer state `prework_follow` |
| Follow mode: user follow | The reader pressed the button, or the reader sat at the end when the turn started | Reducer state `user_follow` |
| Turn phase: idle | The turn is not in progress | Turn status is not in progress |
| Turn phase: prework | Commentary exists, or the first work item has a start time | Phase function, before the final answer |
| Turn phase: final answer | An agent message exists that is not commentary | Phase function |
| Response spacer placed | A new turn starts | Spacer set to its maximum height, scroll set 1 px from the end |
| Response spacer consumed | The response fills the reserved height | Spacer height shrinks as the content grows |
| History page loading | The reader comes within 64 px of the top | Auto-load rule |
| Restored on open | The panel opens with a saved offset above 24 px | Initial offset restore |

## Reference behaviour, as values

**Anchoring.** The thread scroll container disables browser overflow anchoring and lays the content out as a reverse column. The end of the list is therefore the stable edge, and every position is tracked as a distance from the end, not as a scroll top. The at-the-end band is 24 px everywhere on this surface.

**Scroll-to-bottom button.** One string, `localConversation.scrollToBottomButton`. The button is a 32 x 32 px round control, centred horizontally, placed 24 px above the top of the thread footer. When hidden it keeps its place, and it sets opacity 0, pointer events none, tab index -1 and the hidden flag for assistive technology. The opacity transition uses the basic duration token and an ease-in-out curve. The content is an arrow rotated 180 degrees, or three 4 px dots when the turn is still working. The dots animate for 1 s, ease-in-out, infinite, with delays of 0.1 s and 0.2 s on the second and third dot. A separate code pane ships its own button 16 px from the bottom with its own string.

**Press of the button.** If the reader asked for reduced motion, or the distance is already 24 px or less, the move is instant. Otherwise the container animates for 260 ms with the cubic ease-out curve 1 - (1 - p)^3. The animation stops early when the container enters the 24 px band.

**Follow-mode machine.** Four modes and three phases. On entry to the prework phase, static becomes prework watch and user follow becomes prework follow. When prework content overflows the viewport, prework watch becomes prework follow. On the change from prework to the final answer, prework follow becomes user follow and every other mode becomes static. On the change to idle, the mode becomes static unless it is user follow. A press of the scroll-to-bottom button sets prework follow during prework, and user follow otherwise. A user scroll away sets prework watch from prework follow, and sets prework watch or static from user follow. In user follow, and in prework follow during prework, the container is moved to the end instantly on every content change.

**Response spacer.** On a new turn the spacer takes the height min(usable x 2/3, usable - 240 px), where usable is the viewport height less the scroll padding bottom. The container is then set 1 px from the end, instantly. The spacer animates with a spring, bounce 0, duration 0.5 s. A change of 24 px or less is ignored. On the change from prework to the final answer while in prework follow, the animation stops, the spacer is set to 0 and the container moves to the end instantly. The latest turn is placed at the end only when the distance less the spacer height is 300 px or less.

**User intent.** Wheel, touch, key and pointer input each record a direction and a time stamp. A recorded direction expires after 1,000 ms. Wheel deltas in line mode are multiplied by 16 px, and in page mode by the viewport height. A touch move must reach 8 px and must be more vertical than horizontal. Away keys are Arrow Up, Home, Page Up and Shift with Space. Toward keys are Arrow Down, End, Page Down and Space. Keys are ignored when the event repeats, when it is already handled, when the target is an input, a select, a text area or editable content, and when Space lands on a button. A mouse pointer down on the container itself records the geometry so a scrollbar drag reads as a user move.

**Composer growth.** The footer height is observed. It is published as a scroll padding variable, equal to the footer height plus 16 px in the default presentation and equal to the footer height in the compact presentation. Focus inside the footer sets the scroll padding to 0. When the footer height changes, the container position is corrected by the same delta, unless the reader is inside the 24 px band, or a user interrupt is active, or the footer preserve flag is disabled.

**History auto-load.** The next page loads when the remaining distance to the top is 64 px or less. With paged hidden history the trigger is the larger of the viewport height and 64 px. A wheel up at the top also loads. The loop stops when the source reports stop, or when the content no longer grows.

**Content growth in place.** The virtualized turn list records the distance and the scroll height before a height change, then restores the distance on the next animation frame if the scroll height changed. The record is dropped if the element changed or the height did not change.

**Open and reload.** A saved offset is used only when it is above 24 px. With the bottom origin the saved distance is restored, and the follow flag is set when the result is within 24 px. With the top origin the container is set to the top. The layout probe measures header obstacles with a resize observer and one animation frame, for the edge-scroll presentation.

**Images.** No image-specific anchoring exists on this surface. Late image layout is absorbed by the reverse column, by the disabled overflow anchoring and by the virtualized list height restore.

## Table 2. Shipped strings per state

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `localConversation.scrollToBottomButton` | Scroll to bottom | none | Accessible label for the button that scrolls a conversation to its latest message |

That is the only string this surface ships. The follow modes, the spacer, the anchoring and the history load carry no user-visible text.

Neighbouring strings found in the same search, recorded so a later search does not mistake them for this surface:

| Id | Default | Surface |
|---|---|---|
| `chatgpt.codeBlocks.editorPane.scrollToBottom` | Scroll to bottom | The code block editor pane, not the transcript |
| `localConversation.misalignmentPolicyViolation.scrollHint` | Scroll to read the full explanation | A safety explanation block |
| `composer.externalFooter.scrollArea.label` | Composer utility bar | The horizontal action bar above the input |
| `settings.codexMicro.knob.conversationScroll` | Conversation scrolling | A hardware knob mode in settings |
| `settings.codexMicro.knob.conversationScrollClick` | Jump to the latest message | The same knob mode |

The reference ships no new-message pill and no unread-count string for the transcript.

## Table 3. OMP event per state in Reeve

Read from the transcript components and the session hook on this branch.

| Reference state | Reeve's nearest surface | OMP event that carries it |
|---|---|---|
| Pinned to the end | Pin flag, band 48 px | `agent_start` and the send path set the pin true; scroll events clear it |
| Detached | Same flag, cleared by an upward move with user intent | Scroll events only, no OMP event |
| Button hidden and shown | New messages control, shown when the distance is above spacer height + 24 px | Scroll and resize events only, no OMP event |
| Button with working dots | Same control, dots while streaming | `message_start`, `message_update` and `agent_start` keep the streaming flag; `prompt_done` clears it |
| Follow mode: static | Pin false | `prompt_done` leaves the pin as the reader left it |
| Follow mode: prework watch | no source. No phase split exists | no source |
| Follow mode: prework follow | no source | no source |
| Follow mode: user follow | Pin true with the active-turn hold released | The button handler, then `message_update` drives the follow effect |
| Turn phase: idle, prework, final answer | Agent phase labels only, such as waiting model and running command | `agent_start`, `message_start`, `tool_execution_start`, `tool_execution_end`, `agent_end`, `prompt_done`, `agent_settled` |
| Response spacer placed | Active turn response spacer, armed on the run | `agent_start` sets the running flag; the send path arms the hold before the request |
| Response spacer consumed | Same spacer, consumed by scroll and released by an intersection observer | `message_update` grows the content, which moves the scroll |
| History page loading | Lazy-load sentinel, 50 messages per page | no source. It is a local render window, not a session load |
| Restored on open | none. The transcript jumps to the end instantly on first render | no source. No offset is saved per session |
| Composer growth compensation | no source. The composer height is published as a variable, and the transcript does not correct its position | no source |
| Header or panel overlap probe | no source | no source |

## Parity checklist

**Matches**

- The response spacer ratio 2/3, the minimum remaining height 240 px, the placement distance 1 px and the duration 500 ms are the same values as the reference.
- The scroll-to-bottom visibility rule is the same: the distance must exceed the spacer height plus 24 px.
- The button geometry is the same: 32 x 32 px, round, centred, 24 px above the composer.
- The working dots are the same: three 4 px dots, 1 s, ease-in-out, infinite, with 100 ms and 200 ms delays, and no animation under reduced motion.
- Both disable browser overflow anchoring on the scroll container.
- Both honour reduced motion for a programmatic move.
- Both drop the pin only on an upward move with user intent, and both ignore small layout moves.
- Both treat wheel, pointer, touch and scroll keys as intent, and both ignore keys typed in an input or a text area.
- Both restore the position when older content is prepended.
- Both ship the same English string for the button label.

**Lacks**

- No phase split. Reeve has one pin flag, so prework watch and prework follow have no analogue, and the transition from prework to the final answer does not reset the spacer.
- No saved scroll offset. A reload of a long session always lands at the end, so the reference restore rule has no analogue.
- No composer growth compensation. The reference corrects the position by the footer delta; Reeve does not.
- No scroll padding variable driven by the footer height, and no reset of it when focus enters the footer.
- No overlap probe for a header or an opened panel.
- No 300 px placement rule for the latest turn.
- No 64 px history auto-load trigger. Reeve loads a page only when a sentinel at the top becomes visible.
- No early stop of a programmatic move when the reader reaches the band.

**Differs**

- The at-the-end band is 48 px in Reeve and 24 px in the reference. The new messages control still uses 24 px above the spacer, so the two thresholds disagree inside one surface.
- The reference expires a recorded scroll direction after 1,000 ms. Reeve holds user intent for 1,200 ms and ignores programmatic scrolls for 700 ms.
- The reference animates its own move for 260 ms with a cubic ease-out. Reeve calls the native smooth behaviour, so the duration and the curve belong to the browser.
- The reference spacer uses a spring with bounce 0. Reeve uses a CSS height transition of 500 ms with an ease token, and turns the transition off while the spacer is consumed.
- The reference ignores spacer changes of 24 px or less. Reeve applies every change.
- Reeve adds a transcript navigation rail with per-turn jump and preview, and a string for it. The reference has no such rail on this surface.
- Reeve ships a second string, "New messages. Go to the newest message.", although the control renders the button label. The reference ships one string.
- Reeve adds contained overscroll behaviour. The reference does not set it on the thread container.

## What only a live run can settle

- Whether the 48 px band and the 24 px control rule make the button appear while the transcript still follows.
- Whether the spacer release through the intersection observer happens at the same moment as the reference reset on the final answer.
- Whether the native smooth scroll in Reeve feels slower or faster than the 260 ms reference curve on a long transcript.
- Whether a growing composer moves the reading position in Reeve during a stream.
- Whether a late image load shifts the transcript in either product.
- Whether the lazy-load sentinel fires early enough to hide the load on a fast scroll to the top.
- Whether the reference button ever shows during prework follow, because the spacer covers the gap for most of that phase.
