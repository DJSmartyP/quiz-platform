# XP Studio / XP Play mockup checklist

Reference: the supplied original design pack (creator host console, XP Play main display, player question, and player join mockups). The app now uses the XP Studio and XP Play logo system and favicon, supplied pixel grid and corner assets, the two token palettes, quiz-title-first live screens, and separate round and overall scores.

## Next: close the visual gaps

- [ ] Refine the Host at 1280 × 720: bring the current-screen strip, next action, incoming answers, and full leaderboard above the fold. Make the answer table denser and show the next action more prominently, as in the host reference.
- [ ] Give the Main Screen a dedicated 1280 × 720 layout. Keep the quiz title, question, four answer tiles, timer, and answer count visible without scrolling. Match the 2 × 2 tile spacing, coloured borders, corner pixels, and code panel in the XP Play mockup.
- [ ] Refine the Player at 360–430px: place the identity card, timer bar, question card, and 60px answer targets in the order and spacing of the mockup. Add a clear selected and locked tile state, plus a compact confirmation panel.
- [x] Brand the Join screen as XP Play, group code and name in one bordered pixel panel, and align the avatar picker to four columns on phones.
- [ ] Keep the primary join button visible sooner on short phone screens without making the avatar choice too cramped.
- [ ] Use the supplied pixel spark and frame SVGs in more state-specific details. Add restrained, reduced-motion-safe transitions for answer open, reveal, rank movement, and final results.
- [ ] Check colour contrast, focus rings, 320/360/430/480px portrait, phone landscape, and 1280 × 720 / 1920 × 1080 presentation views on real browsers. Make any overflow and text-wrap corrections found there.

## Product work needed for the complete mockups

- [ ] Build a full round editor: add, delete, and rename rounds as first-class objects; choose and fully edit every question type; validate answers and timers. The current editor can rename a question's round, duplicate a question, and change question order, so it can already form rounds of different lengths and mixes of existing types.
- [ ] Add per-question score feedback, round-only score screen, and cumulative leaderboard controls to the host console, including clear previews of what will appear next.
- [ ] Add dedicated lobby, break, round-intro, leaderboard, and final-result layouts with the avatar emphasis shown in the design pack.
- [ ] Complete the cross-device acceptance test for the Firestore mode with one Host, one Main Screen, and two separate Player devices. The local demo still synchronises tabs in one browser.
- [x] Add a visible theme selector to every quiz card and the quiz editor. Persist the selected theme and apply it to the XP Play Player and Main Screen surfaces.
- [ ] Replace remaining legacy light-theme CSS with token-based creator and live components. Extract reusable `AnswerTile`, `TimerBar`, `GameCode`, `ScoreRow`, and `AvatarFrame` components.

## Visual asset status

The XP Studio and XP Play logo system, favicon, pixel grid, and corner SVG are in use. XP Studio has an 8-bit host platypus hero and a custom foundry building with question-format, theme, and live-sync readouts. XP Play has a dedicated transparent pixel logo used by the player portal and Main Screen. Twelve selectable themes include raster background art and simple CSS frames: Quiz Show, Western, Neon Sci-Fi, Arcane Fantasy, Monster Mash, Celebration, Retro Sports, Pixel Cinema, World Tour, Synthwave Festival, Deep Sea Discovery, and Detective Noir.

### Further rich-asset pass

- [ ] Add distinct round-intro, break, reveal, score, and final-result pixel scenes for each theme.
- [ ] Add themed timer shells, answer-tile corner pieces, score podiums, and transition sprites.
- [ ] Add reduced-motion alternatives for every animated asset.
- [ ] Create separate mobile crops where a full-screen background loses its focal point at 360–430px.
