# Quiz Platform v1 — Codex Build Specification

## 1. Product Summary

Build a Jackbox-style online quiz platform that can be hosted on **GitHub Pages** and use **Firebase** for authentication, live synchronisation and game data.

The first use case is a **Phantom Peak edition quiz**, but the app must be built as a reusable multi-theme platform for other events and quiz styles.

The system has four primary experiences:

1. **Player**
   - joins with a game code or direct game link
   - enters a display name
   - selects an avatar
   - uses their phone as the controller/input device
   - does not get Host controls

2. **Main Screen**
   - 16:9 presentation view
   - intended for Discord screen share / OBS / projector use
   - shows titles, round intros, questions, answer reveals, scoreboards, final results and break screens
   - never shows private Host controls or private marking data

3. **Host / GM Screen**
   - live operations console
   - controls progression
   - sees live incoming answers
   - marks text/free-response answers live
   - sees complete live leaderboard for all players
   - sees current state and the next screen/action
   - can correct/void/override scoring

4. **Organiser / Admin**
   - Organisers create and manage quizzes
   - Admin manages organisers and platform-wide content/settings

---

# 2. Core Technical Architecture

## Frontend

Use:

- **React**
- **TypeScript**
- **Vite**
- Firebase Web SDK
- Hash routing suitable for GitHub Pages

Do not build this as loose vanilla JavaScript.

## Hosting

- GitHub Pages
- Single application deployment

## Firebase

Use:

- **Firebase Authentication**
- **Cloud Firestore**
- Firestore realtime listeners

Do not add:

- Firebase Realtime Database
- Firebase Cloud Functions
- Firebase Storage

for v1.

## Cost and capacity goal

Use Firebase's **Spark (no-cost) plan** with GitHub Pages. Do not require a billing account or paid Firebase features for v1. Do not require image/media uploads through Firebase Storage.

The supported v1 game capacity target is **50 joined Players per game**. Reject a 51st join with a clear "Game full" message. This is a product limit, not a published Firebase per-game limit. Verify 50 simultaneous Players, one Host and one Main Screen with a realistic multi-round load test and a Firestore read/write budget before release. If this test fails within Spark quotas, optimise listener scope and document fan-out before lowering the supported limit.

Current Spark quotas and Firebase service limits must be checked during deployment; the app should surface quota-related failures clearly rather than silently losing game data.

## Important architecture rule

**Firestore carries state/events, not animation ticks.**

Do not write timer countdown values every second or every 0.5 seconds.

Store authoritative timestamps and calculate countdowns/animations locally.

---

# 3. User Roles

## Admin

One designated platform-level account, held by the product owner. There is no multi-Admin management in v1. The initial Admin identity must be bootstrapped outside the public client, and Firestore rules must prevent any client from granting itself Admin access. The Admin has access to:

- organiser approvals
- organiser suspension/reactivation
- all quizzes
- all active games
- archive/transfer quiz ownership
- force-close abandoned sessions
- platform themes
- avatar-pack availability
- platform defaults
- audit/admin activity

## Organiser

Authenticated account that can:

- create quizzes
- edit own quizzes
- duplicate quizzes
- archive quizzes
- configure quiz themes
- enable avatar packs
- launch games
- run test games
- access Host controls for games they own
- view completed game summaries
- export/regenerate final result PDFs while completed game data exists
- delete completed games they own

An Organiser cannot:

- edit another organiser's quiz
- promote themselves
- change platform roles
- edit Admin-only platform settings

## Pending Organiser

Authenticated user awaiting approval by the single Admin.

Can:

- sign in
- see pending approval state

Cannot:

- create quizzes
- launch games
- access Host controls

## Player

Temporary participant for a single game.

Use Firebase anonymous authentication.

Can:

- join an active game
- set own display name
- select own avatar
- submit own answers
- read own released results
- read public game state

Cannot:

- read answer keys
- read other players' private submissions
- alter any score
- alter game state
- reveal answers
- finalise results
- access Host controls
- access quiz editor content

---

# 4. Authentication Isolation

Organiser authentication and anonymous Player authentication must not overwrite each other in the same browser.

Use separate named Firebase app/auth instances or another robust isolation strategy.

This must support:

- Organiser logged in to dashboard
- same browser opening Player route for testing
- Organiser session must remain intact

This is a required acceptance test.

---

# 5. Routes

Use hash routing for GitHub Pages.

Recommended routes:

```text
/#/join
/#/join/:gameCode

/#/screen/:gameId
/#/host/:gameId

/#/organiser
/#/organiser/quizzes
/#/quiz/:quizId/edit

/#/admin
```

The route itself must never grant permission.

Firebase rules/auth state determine real permissions.

---

# 6. Quiz Lifecycle

A quiz should support:

```text
DRAFT
READY
ARCHIVED
```

Only `READY` quizzes may be launched.

Before launch, run full validation.

A live game must run from an **immutable snapshot** of the source quiz.

```text
Quiz Template
   ↓ Start Game
Live Game Snapshot
```

Editing the source quiz after launch must not affect the live game.

---

# 7. Game Lifecycle

Game statuses:

```text
LOBBY
RUNNING
BREAK
FINISHED
CLOSED
ABANDONED
```

Definitions:

- **LOBBY** — players can join, game not started
- **RUNNING** — quiz in progress
- **BREAK** — Host-triggered safe-state break
- **FINISHED** — final results / thanks screen still accessible
- **CLOSED** — session ended and no longer joinable
- **ABANDONED** — force-closed/recovered incomplete session

---

# 8. Game State Machine

Use one authoritative state engine.

Pages should not independently decide the next state.

Core presentation flow:

```text
TITLE / LOBBY
      ↓
NEXT SECTION
      ↓
ROUND INTRO / EXPLANATION
      ↓
QUESTION DISPLAY
      ↓
OPEN ANSWERS
      ↓
QUESTION CLOSED
      ↓
ANSWER REVEAL
      ↓
FINALISE QUESTION
      ↓
NEXT QUESTION
      ↓
...
      ↓
ROUND SCORES
      ↓
TOTAL SCORES
      ↓
NEXT SECTION
      ↓
...
      ↓
FINAL SCORES
      ↓
THANKS FOR PLAYING
      ↓
CLOSE SESSION
```

## Why QUESTION DISPLAY and OPEN ANSWERS are separate

This is required because the Main Screen may be streamed through Discord and players may see the streamed question slightly later than their phones receive Firebase updates.

Question flow:

1. Main Screen shows question
2. Player devices say "Look at the main screen"
3. Host presses **Open Answers**
4. answer controls activate on phones
5. timer begins if enabled

---

# 9. State Versioning / Double-Action Protection

Every Host-controlled game transition should increment a `stateVersion` or equivalent revision.

Stale Host actions must not overwrite newer state.

Double-clicking actions such as:

- Finalise Scores
- Reveal Answer
- Next Question

must not create duplicate scoring/state transitions.

All scoring finalisation must be **idempotent**.

---

# 10. Host Ownership / Multiple Host Tabs

Only one active Host controller should control a game at a time.

If another Host tab opens:

- it may observe
- it should show that another controller is active
- it may offer an explicit "Take Control" action

Avoid two Host tabs fighting over state.

---

# 11. Break Screen

Do not support general mid-question pause/resume.

Breaks happen only at safe states.

Host can trigger a break:

- after a question is finalised
- after Round Scores
- after Total Scores
- before the next section

Break state must store a `resumeTarget`.

Main Screen:

```text
BREAK TIME
We'll be back shortly.
```

Optional organiser-configured break message.

Player phone:

```text
QUIZ BREAK
Keep this page open.
The game will continue shortly.
```

Host:

```text
[Resume Quiz]
```

---

# 12. Player Join Flow

## Via direct game link

```text
Open /#/join/:gameCode
   ↓
Enter name
   ↓
Choose avatar
   ↓
Join game
```

## Via generic join page

```text
Enter game code
   ↓
Enter name
   ↓
Choose avatar
   ↓
Join game
```

## Name rules

- unique within a game
- case-insensitive
- trim whitespace
- enforce sensible max length, recommended 20–24 characters
- render as text only, never HTML

Examples that must collide:

```text
Smarty
smarty
SMARTY
```

## Joining during game

Host setting:

```text
Allow late joins: ON / OFF
```

If ON:
- late player starts at 0
- cannot answer historical questions
- joins current/next valid state

If OFF:
- show clear "Game already in progress" message

The 50-Player capacity includes late joins. Enforce the limit atomically when a Player joins; a client-side count alone is insufficient. A reconnect to an existing Player record does not consume another slot.

---

# 13. Reconnection

Same browser/device should reconnect to the same temporary Player record using anonymous Firebase identity.

On reconnect:

- restore name
- restore avatar
- restore score
- return to current game state

If player changes device:
- Host may reassign/transfer an existing player record to the new connection
- no permanent recovery account required in v1

Do not build permanent player identities.

---

# 14. Connection / Failure Feedback

Player UI should clearly display:

- Connected
- Reconnecting
- Submission sending
- Submission received
- Game closed
- Game not found
- Permission denied
- Invalid game code

Do not silently lose answers.

A submitted answer should remain visibly pending until acknowledged.

---

# 15. Player UI Philosophy

The Main Screen is the primary presentation.

The phone is the controller.

However:

> The phone must display whatever information is necessary to operate the mechanic.

Examples:

- Multiple Choice phone may show A/B/C/D only
- Ordering phone must show the items being reordered
- Matching phone must show items/pairs
- Categorise phone must show items and categories

Do not blindly hide interactive content from the phone.

---

# 16. Main Screen Requirements

Main Screen must be:

- presentation-only
- 16:9-oriented
- responsive
- no-scroll in normal use
- usable for Discord screen share / OBS / projector
- visually themed by quiz theme

States include:

- Title / Lobby
- Next Section
- Explanation
- Questions
- Answer Reveal
- Round Scores
- Total Scores
- Break
- Final Scores
- Thanks for Playing

Main Screen must not expose:

- answer keys before reveal
- marking controls
- private responses
- admin data
- private Host controls

---

# 17. Host / GM Screen Requirements

The Host screen is a live operations console.

It should always clearly show:

1. what is currently on the Main Screen
2. what players are currently doing
3. incoming answers / marking state
4. live scores
5. what the next screen/action will be

Suggested layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ ROUND / QUESTION STATUS                    GAME CODE         │
│ player count · answered count · waiting count               │
├───────────────────────────────┬─────────────────────────────┤
│ CURRENT                       │ LIVE ANSWERS                │
│                               │                             │
│ question / answer info        │ incoming submissions        │
│ reference answer              │ live marking controls       │
├───────────────────────────────┼─────────────────────────────┤
│ LIVE LEADERBOARD              │ NEXT SCREEN                 │
│ every player                  │ preview/reminder            │
│ committed/projected totals    │                             │
├───────────────────────────────┴─────────────────────────────┤
│ contextual Host controls                                      │
└─────────────────────────────────────────────────────────────┘
```

---

# 18. Live Incoming Answers

Host must receive answers in realtime for every question type.

Examples:

## Multiple choice

```text
Sarah — B — Correct
Dave — C — Incorrect
Alex — B — Correct
Ben — Waiting
```

## Text

```text
Sarah — "Eccleston"
Dave — "David Tennant"
Alex — Waiting
```

## Number

```text
Sarah — 1984
Dave — 1983
Alex — 2000
```

## Anagram

Host should see attempts live.

---

# 19. Live Text / Free-Response Marking

Text and Free Response can be marked **while answers are still arriving**.

Marks remain provisional until finalisation.

## Text answer modes

- exact/accepted automatic match
- suggested match
- manual override

Automatic normalisation should:

1. trim whitespace
2. ignore letter case
3. normalise repeated spaces

Do not auto-accept fuzzy spellings.

Fuzzy-looking answers may be surfaced as:

```text
Possible match
```

for one-click Host approval.

## Free Response controls

Per answer:

```text
[0] [Half] [Full] [Custom]
```

Host should be able to mark incoming responses immediately.

## Useful Host marking tools

- Unmarked / Marked / All filters
- mark all identical answers together
- mark all remaining zero
- change/undo provisional mark
- custom score
- universal score override

---

# 20. Scoring Model

Each Player/Question combination must have exactly one authoritative result record.

Do not implement scoring as repeated `player.total += points` mutations.

Conceptually:

```text
game
  question
    player
      awardedPoints
```

Changing a score updates the same result.

Overall totals can be derived or safely maintained from results.

This prevents double-awards and makes correction/undo possible.

---

# 21. Default Question Scoring Rules

Lock v1 rules as:

| Question type | v1 scoring |
|---|---|
| Single Choice | full / zero |
| Multi-select | exact set = full, otherwise zero |
| True / False | full / zero |
| Text Answer | accepted = full; Host override allowed |
| Free Response | Host: 0 / half / full / custom |
| Number | exact or configured tolerance |
| Closest Wins | closest player(s) receive full configured points |
| Ordering | exact order = full |
| Matching | partial credit by correct pairs |
| Categorise | partial credit by correctly categorised items |
| Multi-part / List | each valid part contributes its allocated share |
| Anagram | timed declining score |

---

# 22. Host Score Views

Host should support:

```text
Committed
Projected
```

## Committed
Official current scores before current question finalises.

## Projected
Committed totals plus current provisional marking.

Example:

```text
1. Sarah   8,200   (+1,000) projected 9,200
2. Smarty  8,600   (+500)   projected 9,100
3. Dave    8,750   (+0)     projected 8,750
```

---

# 23. Full Live Host Leaderboard

Host must always be able to see **all players**.

Features:

- full player list
- rank
- display name
- avatar
- current round score
- current total
- current-question provisional score
- projected total
- answer status
- search
- sort

Suggested sort options:

- rank
- name
- total score
- round score
- answer status

Clicking a player may open a Host-only detail panel with:

- current answer
- current mark
- score history
- override controls

---

# 24. Public Leaderboards

The Main Screen Total Scores and Final Scores views show a **Top 10** leaderboard. Show the top three prominently as a podium with gold, silver and bronze treatment for ranks 1, 2 and 3. Keep names, avatars and scores readable at 16:9. Players outside the Top 10 still see their own rank and score on their phones.

Use equal ranks for tied scores. Joint first, second or third-place Players share the corresponding medal treatment. Include all Players tied at the tenth-place cutoff, even when this displays more than ten entries; page or animate the extra entries instead of shrinking text.

**Round Scores must show every Player's score** for that round and their running total, up to the 50-Player game limit. Use a readable scrolling or paged list that eventually displays every Player. The Host must be able to pause or advance the list so the audience can read it. Do not reduce text to fit all 50 at once.

Player phone always shows:
- own score
- own position
- own round result when published

---

# 25. Ties

## Leaderboard ties

Use proper equal positions.

Example:

```text
1st Sarah   12,000
1st Smarty  12,000
3rd Dave    11,500
```

Joint winners are allowed.

Podium placement uses these same competition ranks: a tie for first gives each tied Player gold, then the next rank is third and receives bronze. A missing rank does not produce a medal recipient.

## Closest Wins ties

If two players are equally close:
- both receive the configured full score

Do not use fastest-answer tiebreaking in v1 unless explicitly added later.

---

# 26. Question Types — v1

Support exactly these 12 core types:

1. Single Choice
2. Multi-select
3. True / False
4. Text Answer
5. Free Response
6. Number
7. Closest Wins
8. Ordering
9. Matching
10. Categorise
11. Multi-part / List
12. Anagram

Do not add Buzzer to v1.

---

# 27. Question-Type Architecture

Do not implement question mechanics as one giant conditional file.

Each question type should implement a common contract conceptually like:

```text
Question Type
 ├── editor component
 ├── validator
 ├── main-screen renderer
 ├── player renderer
 ├── Host renderer
 ├── answer normaliser
 └── scoring logic
```

New question types should be pluggable later without rewriting the game engine.

---

# 28. Media

Media is a modifier, not a separate question type.

Examples:

- Single Choice + image = picture question
- Text Answer + audio = identify the song/sound
- Choice + video = video question

Support in v1:

```text
bundled
external URL
```

Do not support uploaded media in v1.

Media model should be future-ready:

```text
type: bundled | external | uploaded
src: ...
```

Only first two are implemented now.

---

# 29. Audio / Video Browser Behaviour

Main Screen should include an initial:

```text
Enable Sound
```

interaction so later media playback is not blocked by browser autoplay policy.

Only Main Screen should automatically play question media.

Host screen should not unexpectedly play duplicate audio.

---

# 30. Anagram Mechanic

Organiser sets only:

- correct answer
- timer
- maximum points

System handles the rest.

## Scramble behaviour

- generated once when live game snapshot is created
- same scramble used for everyone
- spaces stay fixed
- punctuation stays fixed
- one-letter words remain unchanged
- regenerate if scramble accidentally equals original answer
- ignore case for answer validation

## Player behaviour

- repeated guesses allowed
- first correct answer locks score
- recommend rate limit: max one submission per second
- wrong answer response: "Not quite. Try again."

## Scoring

For first 5 seconds:
- full maximum score

After 5 seconds:
- points reduce evenly every 0.5 seconds
- reach exactly 0 when timer expires

Conceptual formula:

```text
if elapsed <= 5:
    score = maxPoints
else:
    score = maxPoints * ((duration - elapsed) / (duration - 5))
```

Clamp to 0.

Apply score on 0.5-second boundaries.

## Visual solve

At the same time:
- letters progressively move/lock into correct positions
- locked letters remain correct

## Timer restriction

Recommended minimum Anagram timer:
- 10 seconds

---

# 31. Timers

Question timers are optional unless the mechanic requires one.

If enabled:
- organiser sets duration
- reaching zero closes answers
- does not auto-reveal
- does not auto-advance

Use authoritative timestamps:

```text
opensAt
closesAt
```

Clients render countdown locally.

Do not write timer values repeatedly to Firestore.

---

# 32. Normal Answer Submission Rules

For normal questions:

- player may change their selection locally before Submit
- pressing Submit locks their answer
- after submit, answer is final

Exception:
- Anagram supports repeated attempts until solved/time expires

No-answer at close:
- 0 points
- status `No response`

---

# 33. Round Defaults

Each round may define:

- default points
- default timer
- default presentation theme override
- round name
- round instructions/explanation

Individual questions may override:

- points
- timer
- other allowed settings

---

# 34. Quiz Structure

Conceptual structure:

```text
QUIZ
│
├── Title Screen
├── Theme
├── Enabled Avatar Packs
│
├── Round
│   ├── Name
│   ├── Explanation
│   ├── Defaults
│   ├── Optional Theme Override
│   ├── Question
│   ├── Question
│   └── Question
│
├── Round
│   └── ...
│
├── Final Scores Configuration
└── Thanks For Playing Configuration
```

Round Scores / Total Scores / Next Section / Final Scores are system states, not fake questions.

---

# 35. Quiz Editor UX

Organiser should interact with the quiz as a show, not a database.

Example:

```text
FRIDAY QUIZ

Theme: Phantom Peak

Avatar Packs:
✓ Default
✓ Phantom Peak

ROUND 1 — GENERAL KNOWLEDGE
"Ten questions to get you started."

Q1  Single Choice
Q2  Text Answer
Q3  Number
Q4  Free Response

[+ Add Question]

ROUND 2 — PICTURE THIS
...

[+ Add Round]
```

Required editor features:

- add/edit/delete question
- duplicate question
- add/edit/delete round
- duplicate round
- reorder questions
- move questions between rounds
- reorder rounds
- duplicate entire quiz
- archive quiz
- preview Main Screen
- preview Player Screen
- debounced autosave
- visible Save status
- undo delete
- validation before launch
- search questions in large quiz
- JSON export
- JSON import

---

# 36. Conditional Question Editor

Do not show every setting for every question type.

Example for Anagram:

```text
ANAGRAM ANSWER
[ Christopher Eccleston ]

TIME
[ 30 ]

MAXIMUM POINTS
[ 1000 ]

[PREVIEW]
```

Hide irrelevant fields.

---

# 37. Editor Save Behaviour

Do not write every keystroke to Firestore.

Use:

- local edit state
- debounce
- save on blur where appropriate

Visible statuses:

```text
Saving...
Saved
Save error
```

---

# 38. Quiz Validation Before Launch

`Start Game` must validate the entire quiz.

Block launch if invalid.

Examples:

- missing correct answer
- missing question text
- zero/invalid point configuration
- invalid timer
- Anagram timer too short
- empty round
- broken/empty media reference
- malformed matching pairs
- duplicate/invalid IDs
- missing final configuration where required

Show organisers a clear validation list.

---

# 39. Test Mode

Required for v1.

Organiser can run:

```text
TEST QUIZ
```

Test mode should allow:

- Host controls
- Main Screen
- one or more test players
- simulated players if feasible
- score flow
- answer reveal
- leaderboard
- final scores
- PDF export

Test games must not be publicly discoverable/joinable unless explicitly opened.

---

# 40. Host Recovery / Broken Question Controls

Host needs:

- Open Answers
- Close Answers
- Reopen Answers if safe
- Reveal Answer
- Finalise Scores
- Next Question
- Take Break
- Resume Break
- Lock/Unlock Joins
- Remove Player
- Rename Player
- Reassign Player
- Override Score
- Accept Additional Answer
- Change Correct Option where feasible
- Award Everyone Full Points
- Void Question
- Skip Question

Corrections affect the live snapshot only.

Do not silently rewrite the reusable source quiz during a live game.

---

# 41. Presentation / Host Next-Screen Reminder

Host screen must always display:

```text
NEXT SCREEN
```

Examples:

```text
NEXT SCREEN
Answer Reveal
```

```text
NEXT SCREEN
Question 5 of 10
```

```text
NEXT SCREEN
Round Scores
```

```text
NEXT SCREEN
Next Section: Picture This
```

Main Host action button should be contextual:

```text
REVEAL ANSWER →
FINALISE SCORES →
NEXT QUESTION →
SHOW ROUND SCORES →
```

Avoid generic "Next" where a precise label is possible.

---

# 42. Avatar System

## Built-in packs

Avatar packs contain the images supplied for that pack; there is no fixed 12-avatar requirement. Each pack's manifest defines its actual selectable avatars.

Bundled packs supplied so far:

1. Standard / Default — 10 colour avatars; always enabled
2. Platypus — 12 character avatars; organiser-selectable
3. Sci-Fi — 13 character avatars; organiser-selectable

Other planned packs include Phantom Peak, Fantasy, Monsters & Spooks, Animals, Retro & Arcade, Pirates & Adventurers, Heroes & Villains, Historical / Costume, Food & Objects and Seasonal. Do not show a planned pack as selectable until its assets and manifest exist.

## Default pack

Always enabled.

The complete user-supplied Standard / Default pack contains ten bundled image assets:

| Slot | ID | Display name | Asset |
|---|---|---|---|
| 1 | `default-red` | Red | `quiz-platform-assets/avatars/default/red.png` |
| 2 | `default-black` | Black | `quiz-platform-assets/avatars/default/black.png` |
| 3 | `default-silver` | Silver | `quiz-platform-assets/avatars/default/silver.png` |
| 4 | `default-green` | Green | `quiz-platform-assets/avatars/default/green.png` |
| 5 | `default-pink` | Pink | `quiz-platform-assets/avatars/default/pink.png` |
| 6 | `default-cyan` | Cyan | `quiz-platform-assets/avatars/default/cyan.png` |
| 7 | `default-purple` | Purple | `quiz-platform-assets/avatars/default/purple.png` |
| 8 | `default-orange` | Orange | `quiz-platform-assets/avatars/default/orange.png` |
| 9 | `default-yellow` | Yellow | `quiz-platform-assets/avatars/default/yellow.png` |
| 10 | `default-blue` | Blue | `quiz-platform-assets/avatars/default/blue.png` |

These ten PNGs are the definitive complete Standard avatar category supplied by the product owner. Each selectable colour is distinct; the earlier duplicate pink JPEG is not part of the pack. Keep their source artwork unchanged. Do not add generated avatars as extra choices in this pack. Use a generated placeholder only if an asset fails to load. Do not use the old gendered placeholder names as avatar identities.

## Platypus pack

The complete user-supplied Platypus pack contains twelve bundled PNG assets. It is optional for organisers to enable on a quiz and uses pack ID `platypus`.

| Avatar ID | Display name | Asset |
|---|---|---|
| `platypus-classic` | Classic Platypus | `quiz-platform-assets/avatars/platypus/classic.png` |
| `platypus-winter-explorer` | Winter Explorer | `quiz-platform-assets/avatars/platypus/winter-explorer.png` |
| `platypus-wizard` | Wizard | `quiz-platform-assets/avatars/platypus/wizard.png` |
| `platypus-stationmaster` | Stationmaster | `quiz-platform-assets/avatars/platypus/stationmaster.png` |
| `platypus-cartographer` | Cartographer | `quiz-platform-assets/avatars/platypus/cartographer.png` |
| `platypus-engineer` | Engineer | `quiz-platform-assets/avatars/platypus/engineer.png` |
| `platypus-punk` | Punk | `quiz-platform-assets/avatars/platypus/punk.png` |
| `platypus-ringmaster` | Ringmaster | `quiz-platform-assets/avatars/platypus/ringmaster.png` |
| `platypus-miner` | Miner | `quiz-platform-assets/avatars/platypus/miner.png` |
| `platypus-cowboy` | Cowboy | `quiz-platform-assets/avatars/platypus/cowboy.png` |
| `platypus-cyber-explorer` | Cyber Explorer | `quiz-platform-assets/avatars/platypus/cyber-explorer.png` |
| `platypus-astronaut` | Astronaut | `quiz-platform-assets/avatars/platypus/astronaut.png` |

The source manifest is `quiz-platform-assets/avatars/platypus/manifest.json`. Keep the supplied artwork unchanged. A Phantom Peak quiz may enable this pack through the standard avatar-pack selector.

## Sci-Fi pack

The complete user-supplied Sci-Fi pack contains thirteen bundled PNG assets. It is optional for organisers to enable on a quiz and uses pack ID `sci-fi`.

| Avatar ID | Display name | Asset |
|---|---|---|
| `sci-fi-neon-alien` | Neon Alien | `quiz-platform-assets/avatars/sci-fi/neon-alien.png` |
| `sci-fi-cosmic-mystic` | Cosmic Mystic | `quiz-platform-assets/avatars/sci-fi/cosmic-mystic.png` |
| `sci-fi-space-mechanic` | Space Mechanic | `quiz-platform-assets/avatars/sci-fi/space-mechanic.png` |
| `sci-fi-space-scientist` | Space Scientist | `quiz-platform-assets/avatars/sci-fi/space-scientist.png` |
| `sci-fi-star-pilot` | Star Pilot | `quiz-platform-assets/avatars/sci-fi/star-pilot.png` |
| `sci-fi-star-pilot-2` | Star Pilot 2 | `quiz-platform-assets/avatars/sci-fi/star-pilot-2.png` |
| `sci-fi-robot-engineer` | Robot Engineer | `quiz-platform-assets/avatars/sci-fi/robot-engineer.png` |
| `sci-fi-cyborg` | Cyborg | `quiz-platform-assets/avatars/sci-fi/cyborg.png` |
| `sci-fi-friendly-robot` | Friendly Robot | `quiz-platform-assets/avatars/sci-fi/friendly-robot.png` |
| `sci-fi-alien-scout` | Alien Scout | `quiz-platform-assets/avatars/sci-fi/alien-scout.png` |
| `sci-fi-astronaut` | Astronaut | `quiz-platform-assets/avatars/sci-fi/astronaut.png` |
| `sci-fi-star-captain` | Star Captain | `quiz-platform-assets/avatars/sci-fi/star-captain.png` |
| `sci-fi-hologram` | Hologram | `quiz-platform-assets/avatars/sci-fi/hologram.png` |

The source manifest is `quiz-platform-assets/avatars/sci-fi/manifest.json`. Keep the supplied artwork unchanged.

## Avatar behaviour

Players choose:
- display name
- avatar

Avatar appears on:
- Player join
- Player UI profile
- lobby
- Round Scores
- Total Scores
- final leaderboard
- podium
- Thanks for Playing
- branded PDF export

## Fallback

Missing avatar asset:
- use generated default placeholder
- never break the UI

## Manifest-driven

Example:

```json
{
  "id": "platypus-classic",
  "name": "Classic Platypus",
  "pack": "platypus",
  "src": "avatars/platypus/classic.png"
}
```

Resolve bundled asset paths against Vite's configured base URL so they work when deployed to a GitHub Pages project path. The Standard pack source manifest is `quiz-platform-assets/avatars/default/manifest.json`.

---

# 43. Theme System

Each quiz has a Theme Profile.

Theme applies to:

- Main Screen
- Player UI
- leaderboard screens
- result screens
- PDF export

Host/Admin dashboards remain primarily functional/neutral, using theme as accents/previews only.

## Theme fields

At minimum:

- primary colour
- secondary colour
- accent colour
- background colour
- surface/card colour
- text colour
- success/highlight colour
- heading style
- answer-button style
- timer style
- scoreboard style

Use CSS custom properties.

## Presets

Ship with presets such as:

- Phantom Peak
- Classic Pub Quiz
- Neon Arcade
- Sci-Fi
- Fantasy
- Dark Minimal
- Bright Party
- Retro

Organisers may:
- choose a preset
- customise colours
- save a reusable theme profile
- reset to preset

## Accessibility

Perform contrast validation and warn/block unusable combinations.

## Round override

Round may optionally override the quiz theme.

---

# 44. Phantom Peak Theme

Phantom Peak is the first themed edition.

Theme direction:

- deep teal / navy
- brass / gold
- warm parchment accents
- quirky adventure / industrial / theatrical atmosphere

It should be implemented as:

```text
Quiz Content
+ Phantom Peak Theme
+ Phantom Peak Avatar Pack
```

Do not fork the application for Phantom Peak.

---

# 45. PDF Final Results Export

Required for v1.

Generate locally in browser if practical.

No Firebase Storage required.

## Access

Available from:

- Host at end of game
- completed-game organiser record while game data exists

## PDF branding

Inherit quiz theme.

Optional settings:

- bundled logo/mark
- report title override
- show avatars
- include round breakdown
- include stats

## Content

Recommended:

### Page 1
- quiz title
- subtitle/theme branding
- date
- player count
- podium / top performers
- final score summary

### Following pages
- full final leaderboard
- avatar
- player name
- final rank
- final score
- optional round-by-round breakdown

Optional stats:
- number of rounds
- number of questions
- highest round score
- average score

## Format

- A4 portrait default
- readable multi-page layout
- ties displayed properly

Suggested filename:

```text
phantom-peak-quiz-2026-09-19-results.pdf
```

---

# 46. Completed Game Retention and Manual Deletion

Players do not have permanent profiles. Completed games remain available until an authorised user explicitly deletes them; there is **no automatic expiry or seven-day cleanup** in v1. The organiser can reopen a completed game and regenerate its PDF while the record exists.

Provide a **Delete Game Data** action for the game owner and the Admin, available from completed-game management. Show what will be removed, require a deliberate confirmation, and report progress, success or failure. Delete the game's responses, grades, results, players, private snapshot, code reservation and other game subcollections, then the game record. Ensure an interrupted deletion can be retried safely. The reusable quiz template is retained unless deleted separately.

Mark the game as `DELETING` before removal so joins, answers and Host transitions stop. Delete child documents in bounded batches; deleting the parent first would orphan child documents. If the browser closes partway through, show the game as needing deletion to resume when an authorised user returns. Firestore rules must permit the owner/Admin to finish this flow while blocking other writes.

Do not use Firestore TTL or scheduled Cloud Functions for cleanup. A parent-document deletion alone does not delete its subcollections.

At minimum, the completed-game record contains:

```text
Quiz title
Date
Player count
Final leaderboard
Round totals
Status: Completed
```

Do not retain detailed individual response history longer than necessary.

After manual deletion, the completed-game record and its PDF regeneration data are gone. The UI must warn the user to download any desired PDF first.

---

# 47. Close Session Flow

End of game:

```text
FINAL SCORES
   ↓
THANKS FOR PLAYING
   ↓
CLOSE SESSION
```

Closing:
- disables joining
- marks session complete
- does not instantly destroy short-term results record

---

# 48. Game Codes

Prefer 5–6 character human-friendly codes.

Avoid confusing characters such as:

```text
0 / O
1 / I
```

Example:

```text
K7M4Q
```

If numeric codes are used instead:
- reserve atomically
- retry collisions

---

# 49. Firestore Audience Separation

Do not place everything into one public game document.

Conceptual collections:

```text
games/{gameId}
    public state

games/{gameId}/players
    player name/avatar/published totals

games/{gameId}/responses
    player-submitted answers

games/{gameId}/grades
    Host-only provisional/committed grades

games/{gameId}/results
    released personal results

games/{gameId}/private
    answer keys / private snapshot metadata
```

Reusable quiz data should also be separated sensibly rather than stored as one huge Firestore document.

---

# 50. Firestore Client Listener Rules

## Player client listens only to

- public game state
- own player record
- own released result
- permitted public roster/leaderboard data

## Main Screen listens only to

- presentation state
- public player roster
- published leaderboard

## Host listens to

- current state
- all responses
- grades
- complete player list
- projected/committed standings
- private answer/reference data

---

# 51. Security Requirements

Firestore rules must prevent Player from:

- reading private answer keys
- reading another player's private response
- reading private grades
- changing own score
- changing another player's score
- changing game state
- revealing answers
- changing role
- editing another organiser's quiz

Use server/request timestamps where needed to validate answer submission timing.

Render all Player-entered text safely.

---

# 52. Firebase Emulator Security Tests

Required before release.

Test that:

- Player cannot read answer key
- Player cannot write score
- Player cannot read another response
- Player cannot alter game state
- Player cannot promote self
- Organiser cannot edit another organiser's quiz
- Pending user cannot launch game
- Admin permissions work as expected
- score finalisation cannot double-award
- stale state updates are rejected

---

# 53. Admin Dashboard

Admin should support:

## Organisers
- approve
- suspend
- reactivate

## Quizzes
- inspect
- archive
- transfer ownership

## Games
- see active games
- force-close abandoned games
- manually delete completed or abandoned game data

## Avatar Packs
- enable/disable platform packs

## Themes
- manage platform presets

## Platform
- game/player defaults
- limits

## Audit
- recent admin actions

---

# 54. Organiser Dashboard

Show:

- My Quizzes
- Draft / Ready / Archived
- duplicate
- edit
- archive
- test
- start game
- recent/completed games
- regenerate PDF while game data exists
- manually delete own completed game data

Example:

```text
Friday Pub Quiz
Ready
5 rounds · 42 questions

[Edit] [Duplicate] [Test] [Start Game]
```

---

# 55. Accessibility

Required:

- keyboard-accessible controls
- adequate contrast
- reduced-motion support
- scalable text
- clear focus states
- accessible labels
- large touch targets
- non-drag alternatives for:
  - Ordering
  - Matching
  - Categorise

Drag-and-drop may exist as an enhancement but must not be the only interaction.

---

# 56. Performance Rules

Do not:

- write timers every second
- write Anagram scoring every 0.5 seconds
- autosave every keypress
- subscribe Players to unnecessary collections
- load all private Host data into Player clients

Do:

- use timestamp-based local rendering
- debounce editor saves
- minimise listener scope
- preload next media where useful
- keep presentation transitions local

---

# 57. Failure / Fallback UI

Explicit UI required for:

- invalid game code
- game not found
- game closed
- permission denied
- reconnecting
- offline
- failed submission
- failed media
- missing avatar
- failed PDF export
- incomplete quiz validation

Never fail silently.

---

# 58. Media Preflight

Before live launch:

- validate configured media URLs where possible
- warn organiser of missing/broken references
- preload upcoming media where reasonable

If media fails live:
- show safe placeholder
- Host receives clear warning
- game remains controllable

---

# 59. Schema Versioning

From day one, include schema/version fields for:

- quizzes
- exported/imported quiz JSON
- question structures
- avatar manifests
- theme profiles

This supports future migration.

---

# 60. Import / Export

Required for v1:

## Quiz Export
- JSON
- includes schema version
- quiz content
- rounds
- questions
- scoring settings
- theme reference/config
- enabled avatar packs

## Quiz Import
- validate schema
- reject or migrate unsupported structures safely
- show clear errors

---

# 61. Features Explicitly Out of Scope for v1

Do not build unless explicitly requested later:

- permanent Player accounts
- lifetime Player stats
- co-hosting
- live chat
- public quiz marketplace
- collaborative quiz editing
- AI marking
- avatar uploads
- question media uploads
- power-ups
- wagers
- confidence betting
- normal-question speed bonuses
- audience voting
- persistent achievements
- public Player profiles
- real-time buzzer mechanic

---

# 62. Recommended Vertical-Slice Build Order

Do not build all 12 question types first.

## Milestone 1 — Foundation

Build:

- React/TypeScript/Vite app
- Firebase setup
- Auth isolation
- routing
- Admin/Organiser/Player role model
- basic Firestore rules

## Milestone 2 — Minimal Quiz Editor

Build:

- create quiz
- create round
- create Single Choice question
- save/validate

## Milestone 3 — Live Game Vertical Slice

Complete one full path:

```text
Create quiz
   ↓
Single Choice question
   ↓
Launch game
   ↓
2 players join
   ↓
Main Screen displays question
   ↓
Host opens answers
   ↓
Players submit
   ↓
Host sees live answers
   ↓
Reveal
   ↓
Finalise
   ↓
Round/Total scores
   ↓
Final leaderboard
   ↓
Thanks for Playing
   ↓
Close session
```

## Milestone 4 — Reliability

Add:

- reconnect
- duplicate-name handling
- late joins
- Host controller lease
- idempotent scoring
- broken-question controls
- break screen
- full Host leaderboard

## Milestone 5 — Remaining Question Types

Implement each through the shared Question Type contract.

## Milestone 6 — Theme / Avatars / PDF

Add:

- theme profiles
- avatar manifests/packs
- Phantom Peak theme
- PDF export

## Milestone 7 — Admin / Test / Import-Export

Finish:

- Admin tools
- test mode
- JSON import/export
- manual game-data deletion
- emulator security tests

---

# 63. Core Acceptance Tests

Before v1 is considered complete, verify:

## Player
- joins by code
- joins by direct link
- picks name/avatar
- duplicate name rejected
- reconnect restores Player
- late join follows Host policy
- cannot access Host controls
- cannot alter scores
- invalid/closed game handled cleanly
- 51st Player is refused with a Game full message; reconnects do not consume another slot

## Host
- sees live incoming answers
- sees every Player
- sees complete live leaderboard
- can switch committed/projected view
- text answers can be marked live
- free responses can be scored 0/half/full/custom
- next-screen reminder always present
- contextual controls are correct
- break works only at safe states
- broken question can be voided
- score override works
- finalising twice does not double score

## Main Screen
- follows Host state
- never exposes private answer/marking data
- readable at 16:9
- handles large leaderboards
- media playback works after sound-enable interaction
- missing media degrades safely
- Total and Final Scores show a readable Top 10 and enlarged gold/silver/bronze podium, with ties handled by equal rank
- Round Scores cycle or scroll through every Player's round score and running total

## Question Mechanics
- all 12 types validate
- all 12 types render correctly on Main/Player/Host
- scoring is deterministic
- ties work
- Anagram timing/score decay works
- Ordering/Matching/Categorise have accessible non-drag controls

## Organiser
- autosave works
- save errors are visible
- duplicate/move/reorder questions
- duplicate/reorder rounds
- preview Main/Player
- validation blocks broken launch
- test mode works
- JSON import/export works
- theme and avatar-pack selection works

## Admin
- approves organiser
- suspends organiser
- transfers quiz ownership
- force-closes session
- cannot be bypassed by client-side role edits

## PDF
- branded
- correct leaderboard
- ties correct
- avatars displayed/fallback works
- round breakdown optional
- can regenerate while completed game data exists

## Security
- pass Firebase Emulator rules tests listed above
- only the designated Admin has Admin rights; no client can self-promote
- manual game deletion removes child collections and can resume after interruption

## Capacity
- 50 simultaneous Players, one Host and one Main Screen complete a realistic multi-round game within the Spark quota budget
- a 51st join is rejected atomically

---

# 64. Final v1 Product Definition

The v1 product is:

- GitHub Pages hosted
- React + TypeScript + Vite
- Firebase Auth + Firestore
- Admin → Organiser → temporary Player role model
- reusable quiz editor
- immutable live-game snapshots
- dedicated Main Screen
- dedicated Host operations console
- dedicated Player controller UI
- 12 defined question mechanics
- live incoming responses
- live text/free-response marking
- full live Host leaderboard for all Players
- committed/projected scoring
- answer reveal controlled by Host
- Round Scores
- Total Scores
- Break screen
- Final Scores
- Thanks for Playing
- branded PDF result export
- reusable theme profiles
- bundled avatar packs
- Phantom Peak as first themed edition
- no paid backend dependency required for v1
