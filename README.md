# Phantom Peak Quiz Studio

Interactive review build for the proposed quiz platform. The complete product plan is in [BUILD_SPEC.md](BUILD_SPEC.md).

## Preview

Run locally:

```sh
npm ci
npm run dev
```

The organiser workspace, quiz editor, host console, main screen, and player view are available from the home page. Open Host, Main screen, and Player view in separate tabs in **one browser** to try the sample quiz. Changes sync across those tabs through browser storage.

## Scope of this review build

- Twelve sample question formats, host progression, answer submission, score calculation, leaderboard, and a small prompt editor.
- All 35 supplied avatars: 10 Standard, 12 Platypus, 13 Sci-Fi. The Sci-Fi pack includes Hologram.
- The live game in this review build is browser-local. A join link works as a navigation preview but different devices do not yet share a game.
- Authentication, persistent quizzes, Firestore multiplayer, security rules, media, PDF export, and the operational admin dashboard are defined in the build specification and are not implemented in this preview.

## Build and deploy

```sh
npm run build
npm run lint
```

The GitHub Actions workflow builds and publishes the site to GitHub Pages when changes are pushed to `main`.

## Firebase

A Firebase project named `nickp-quiz-platform-2026` has been reserved for the live backend. This static review build does not use it or expose any privileged credentials.
