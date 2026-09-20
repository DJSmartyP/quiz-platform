# QuizForge live game setup

The live game implementation uses the existing GitHub Pages site plus Firebase Authentication and Cloud Firestore. The Firebase project is `nickp-quiz-platform-2026`. Its default Firestore database is Standard edition and reports `freeTier: true`; its rules are in `firestore.rules`. Keep the project on the **Spark** plan. Do not enable billing, Cloud Functions, Realtime Database, or Identity Platform upgrades.

## Current activation status

- Firestore is created and its rules compile and deploy.
- The browser application builds and local state-engine tests pass.
- Firebase Authentication has **not** been started in the Firebase console. A direct Identity Platform initialization attempt returned `BILLING_NOT_ENABLED`; do not retry that paid path.
- No organiser account has been approved and the live UI has not passed a two-device test. The published GitHub Pages demo remains the browser-local version until this is verified.

## Activate standard Firebase Authentication on Spark

1. Open [Firebase Authentication](https://console.firebase.google.com/project/nickp-quiz-platform-2026/authentication/providers) for this project. Confirm the sidebar still says **Spark** and **No cost**.
2. Use **Get started** in Firebase Authentication. Enable **Google** for the Host and **Anonymous** for Players. Avoid Identity Platform upgrade prompts and phone/SMS authentication.
3. In Authentication settings, add the authorised domains `djsmartyp.github.io` and `localhost` (plus `127.0.0.1` if local testing uses that address). The Firebase hosted auth domain remains `nickp-quiz-platform-2026.firebaseapp.com`.
4. Open the local Host console and press **Enable device sync**. Sign in with the intended organiser Google account. If approval is missing, the app shows that account's Firebase UID. Create `organisers/{uid}` with `{ approved: true }` using the Firebase console or a trusted admin credential. The public website cannot grant this approval to itself.
5. Test with one Host, one `/screen/{code}` tab and at least two separate Player browser profiles/devices using `/join/{code}`. Check all phase changes, answer acknowledgement, reconnection, scoring, break/resume, secondary Host control and private-answer rules before publishing to `main`.

## Data model

- `liveGames/{code}`: public phase, version, current presentation, timer timestamp, join membership and released scores. It never contains unreleased answer keys or Player submissions.
- `liveGames/{code}/private/engine`: Host-only quiz, answer keys, grades and authoritative transition state.
- `liveGames/{code}/players/{uid}`: Player name/avatar; readable to connected screens for the roster.
- `liveGames/{code}/responses/{uid}_{questionId}`: one private submission per Player and question.
- `liveGames/{code}/results/{uid}_{questionId}`: that Player's released score for the question.
- `organisers/{uid}`: trusted Host approval created outside the web client.

The Host changes phase and increments `stateVersion` in a Firestore transaction. Main Screen and Player routes stay loaded and rerender from listeners. A Player submission transaction writes a deterministic ID and the UI waits for server acknowledgement. The timer uses one server timestamp on opening answers; no second-by-second Firestore writes occur.

## Verification

Run `npm test`, `npm run build`, and `npm run lint`. The local tests cover phase order, round boundaries, score idempotence, break/resume, and withholding unreleased answers. A Firebase Rules API test with fabricated Player identities passed for reading one's own answer and denying another Player's answer. The twenty cross-device acceptance checks from the architecture brief still require Authentication and a live multi-device session; read isolation has not yet been exercised with two real Player identities.
