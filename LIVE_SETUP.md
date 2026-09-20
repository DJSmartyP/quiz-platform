# QuizForge live game setup

The live game implementation uses the existing GitHub Pages site plus Firebase Authentication and Cloud Firestore. The Firebase project is `nickp-quiz-platform-2026`. Its default Firestore database is Standard edition and reports `freeTier: true`; its rules are in `firestore.rules`. Keep the project on the **Spark** plan. Do not enable billing, Cloud Functions, Realtime Database, or Identity Platform upgrades.

## Current activation status

- Firestore is created and its rules compile and deploy.
- The browser application builds and local state-engine tests pass.
- Standard Firebase Authentication is active on Spark. **Anonymous** Player sign-in and **Google** Host sign-in are enabled through `firebase deploy --only auth`; a temporary anonymous sign-in succeeded and its test identity was deleted. Google uses `nickpatel.trainer@gmail.com` as the OAuth support email.
- The approved Authentication domains include `djsmartyp.github.io`, `localhost`, and `127.0.0.1`. Firestore rules permit Host actions only for a verified Google sign-in as `nickpatel.trainer@gmail.com`. A live Main Screen followed a Player joining a Firestore lobby without refresh; that Player also reconnected after refresh. A second independent anonymous Player joined the same lobby during a test and its test account was removed afterwards. Full Host-led question progression across two Player devices has not yet been verified. The published GitHub Pages demo remains the browser-local version until this is verified.

## Activate standard Firebase Authentication on Spark

1. Open [Firebase Authentication](https://console.firebase.google.com/project/nickp-quiz-platform-2026/authentication/providers) for this project. Confirm the sidebar still says **Spark** and **No cost**.
2. Open the local Host console in Chrome or Edge and press **Enable device sync**. Sign in as `nickpatel.trainer@gmail.com`. If the Google popup closes itself in the Codex in-app browser, use a normal browser; the full-page redirect fallback also failed to restore the account in that in-app browser during testing. Players never use this sign-in button: they join with a code, name and avatar and receive an anonymous Firebase identity automatically.
3. Test with one Host, one `/screen/{code}` tab and at least two separate Player browser profiles/devices using `/join/{code}`. Check all phase changes, answer acknowledgement, reconnection, scoring, break/resume, secondary Host control and private-answer rules before publishing to `main`.

## Data model

- `liveGames/{code}`: public phase, version, current presentation, timer timestamp, join membership and released scores. It never contains unreleased answer keys or Player submissions.
- `liveGames/{code}/private/engine`: Host-only quiz, answer keys, grades and authoritative transition state.
- `liveGames/{code}/players/{uid}`: Player name/avatar; readable to connected screens for the roster.
- `liveGames/{code}/responses/{uid}_{questionId}`: one private submission per Player and question.
- `liveGames/{code}/results/{uid}_{questionId}`: that Player's released score and verdict for the question. The Host writes this on reveal and updates it after marking or finalisation.
Host access is granted only to the verified Google account `nickpatel.trainer@gmail.com` by Firestore Security Rules. The web client cannot grant Host access.

The Host changes phase and increments `stateVersion` in a Firestore transaction. Main Screen and Player routes stay loaded and rerender from listeners. A Player submission transaction writes a deterministic ID and the UI waits for server acknowledgement. At reveal, the Main Screen highlights the answer choices and each Player sees their own answer, verdict, and points. The GM sees the private answer key before reveal. The timer uses one server timestamp on opening answers; no second-by-second Firestore writes occur.

## Verification

Run `npm test`, `npm run build`, and `npm run lint`. The local tests cover phase order, round boundaries, score idempotence, break/resume, and withholding unreleased answers. Firebase Rules API checks passed for own-answer reads versus another Player's answer and for Host creation: the verified admin Google email was allowed, while another email, an unverified email, and an anonymous identity were denied. Two independent anonymous identities joined the live lobby and one refreshed into the same controller. The remaining question, scoring, break, secondary Host and real Player read-isolation checks from the twenty cross-device acceptance tests require a complete Google Host sign-in in a normal browser. Host reload reconnection is implemented but has not been verified in a signed-in browser.
