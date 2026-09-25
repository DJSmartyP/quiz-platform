# XP Studio

XP Studio is a live, host-led quiz platform for a shared Main Screen and player phones. The complete product plan is in [BUILD_SPEC.md](BUILD_SPEC.md), and the mockup gap list is in [DESIGN_TODO.md](DESIGN_TODO.md).

## Preview

Run locally:

```sh
npm ci
npm run dev
```

The organiser workspace, quiz editor, host console, XP Play Main Screen launcher, and XP Play Player Portal are available from the home page. Live sessions use Firestore so the Host can move every connected screen forward without a refresh. See [LIVE_SETUP.md](LIVE_SETUP.md) for the Firebase configuration.

## Current build

- Fourteen question formats, host progression, answer submission, visible countdowns, score calculation, round-only scores, cumulative leaderboard, and a complete question editor.
- Anagrams have an editable answer, a saved jumble, and letters that progressively lock into place while the timer runs.
- Text-based questions can include an image; dedicated photo reveal and photo zoom modes animate from authoritative timestamps.
- Twelve selectable 8-bit visual themes style the Main Screen and Player controller: Quiz Show, Western, Neon Sci-Fi, Arcane Fantasy, Monster Mash, Celebration, Retro Sports, Pixel Cinema, World Tour, Synthwave Festival, Deep Sea Discovery, and Detective Noir. A quiz has one default theme and each round can optionally override it.
- Every visual theme includes dedicated full-screen intermission and thank-you finale artwork, with brighter presentation and controller backgrounds throughout the live game.
- All 143 supplied avatars across 12 packs, including the 13 transparent Sci-Fi cutouts. The original Standard and Platypus images are preserved.
- The Firestore Host/Main Screen/Player flow uses Google Host sign-in, anonymous Player identities, narrow realtime listeners, deterministic submissions, and versioned Host transitions.
- Quiz packs can be created, duplicated, imported, exported, and saved to each signed-in Host's private cloud library.
- Ending a live session closes it for every connected device. Ended sessions are removed after 24 hours when the owner next opens XP Studio, and the Host can delete one immediately.

Future theme ideas and the recommended asset order are in [ROUND_THEME_IDEAS.md](ROUND_THEME_IDEAS.md).

## Build and deploy

```sh
npm run build
npm run lint
npm test
```

The GitHub Actions workflow builds and publishes the site to GitHub Pages when changes are pushed to `main`.

## Firebase

The Firebase project `nickp-quiz-platform-2026` has a free-tier Firestore database and deployed security rules. Live setup and remaining checks are documented in [LIVE_SETUP.md](LIVE_SETUP.md). The web config in the client is public; no privileged credentials are in this repository.
