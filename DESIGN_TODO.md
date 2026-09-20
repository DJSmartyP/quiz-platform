# QuizForge / PixelPlay mockup checklist

Reference: the supplied QuizForge design pack (creator host console, PixelPlay main display, player question, and player join mockups). The demo now uses the supplied final QuizForge logo and favicon, supplied pixel grid and corner assets, the two token palettes, quiz-title-first live screens, and separate round and overall scores.

## Next: close the visual gaps

- [ ] Refine the Host at 1280 × 720: bring the current-screen strip, next action, incoming answers, and full leaderboard above the fold. Make the answer table denser and show the next action more prominently, as in the host reference.
- [ ] Give the Main Screen a dedicated 1280 × 720 layout. Keep the quiz title, question, four answer tiles, timer, and answer count visible without scrolling. Match the 2 × 2 tile spacing, coloured borders, corner pixels, and code panel in the PixelPlay mockup.
- [ ] Refine the Player at 360–430px: place the identity card, timer bar, question card, and 60px answer targets in the order and spacing of the mockup. Add a clear selected and locked tile state, plus a compact confirmation panel.
- [ ] Bring the Join screen closer to the mockup: group code and name in one bordered panel, align the avatar picker to four columns, and keep the primary join button visible without excessive scrolling on a phone.
- [ ] Use the supplied pixel spark and frame SVGs in more state-specific details. Add restrained, reduced-motion-safe transitions for answer open, reveal, rank movement, and final results.
- [ ] Check colour contrast, focus rings, 320/360/430/480px portrait, phone landscape, and 1280 × 720 / 1920 × 1080 presentation views on real browsers. Make any overflow and text-wrap corrections found there.

## Product work needed for the complete mockups

- [ ] Build a full round editor: add, delete, and rename rounds as first-class objects; choose and fully edit every question type; validate answers and timers. The current editor can rename a question's round, duplicate a question, and change question order, so it can already form rounds of different lengths and mixes of existing types.
- [ ] Add per-question score feedback, round-only score screen, and cumulative leaderboard controls to the host console, including clear previews of what will appear next.
- [ ] Add dedicated lobby, break, round-intro, leaderboard, and final-result layouts with the avatar emphasis shown in the design pack.
- [ ] Implement a real-time backend for separate phones and devices. The current demo synchronises tabs only within the same browser origin; a GitHub Pages deployment is a static preview.
- [ ] Add a theme selector and preserve the PixelPlay theme as the default. Quiz themes should override colours and optional decoration while retaining the accessibility rules.
- [ ] Replace remaining legacy light-theme CSS with token-based creator and live components. Extract reusable `AnswerTile`, `TimerBar`, `GameCode`, `ScoreRow`, and `AvatarFrame` components.

## Visual asset status

The supplied final logo, favicon, pixel grid, and corner SVG are already in use. No new background graphic is needed for the current PixelPlay shell; the supplied pixel grid gives the intended texture. More elaborate round art can be added when theme selection exists.
