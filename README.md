# QuizForge

Interactive review build for the QuizForge creator platform and its default PixelPlay live theme. The complete product plan is in [BUILD_SPEC.md](BUILD_SPEC.md), and the mockup gap list is in [DESIGN_TODO.md](DESIGN_TODO.md).

## Preview

Run locally:

```sh
npm ci
npm run dev
```

The organiser workspace, quiz editor, host console, main screen, and player view are available from the home page. Open Host, Main screen, and Player view in separate tabs in **one browser** to try the sample quiz. The browser-local demo uses browser storage; the Firestore live mode is being activated separately as described in [LIVE_SETUP.md](LIVE_SETUP.md).

## Scope of this review build

- Twelve sample question formats, host progression, answer submission, visible countdowns, score calculation, round-only scores, cumulative leaderboard, and a small prompt editor.
- Anagrams have an editable answer, a saved jumble, and letters that progressively lock into place while the timer runs.
- All 143 supplied avatars across 12 packs, including the 13 transparent Sci-Fi cutouts. The original Standard and Platypus images are preserved.
- A Firestore-based Host/Main Screen/Player implementation is in progress. Its rules are deployed, but Authentication and cross-device acceptance tests are still pending; the published build remains browser-local.
- Persistent quiz storage, media, PDF export, and the operational admin dashboard are defined in the build specification and are not implemented in this preview.

## Build and deploy

```sh
npm run build
npm run lint
npm test
```

The GitHub Actions workflow builds and publishes the site to GitHub Pages when changes are pushed to `main`.

## Firebase

The Firebase project `nickp-quiz-platform-2026` has a free-tier Firestore database and deployed security rules. Live setup and remaining checks are documented in [LIVE_SETUP.md](LIVE_SETUP.md). The web config in the client is public; no privileged credentials are in this repository.
