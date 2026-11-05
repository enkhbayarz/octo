# OctoLearn — video course prototype

A mobile prototype for learning English: a zigzag learning path, video lessons, unit quizzes and a profile. The UI is in Mongolian (default) and English. **Expo SDK 58 + TypeScript** for iOS and Android, with an optional **Node + PostgreSQL** API deployed on Railway.

| Deliverable           | Where                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Android APK           | [Download](https://expo.dev/artifacts/eas/zEvwLxvLlo3E3_aAybN9J-T1QXmKkPt-CWLgEG6doRQ.apk)    |
| iOS Simulator build   | [Download](https://expo.dev/artifacts/eas/8e-Px6C3mTo3Ym0zDFHehpQjYEv2uzkk-bMYQDSdGmw.tar.gz) |
| Demo video            | Attached to the submission email                                                              |
| Live API              | [API reference](https://api-production-bed0e.up.railway.app/docs)                             |
| Architecture write-up | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                  |
| Design write-up       | [docs/DESIGN.md](docs/DESIGN.md)                                                              |

## Run it

**Fastest:** install the APK above. No account is needed: the app works as a guest, and offline apart from streaming the video.

**iOS Simulator:** download the build above, extract it, and drag `OctoLearn.app` onto a running simulator.

**From source:** you need Node **22.13+**, [Bun](https://bun.sh), and Expo Go for SDK 58 on a phone or simulator.

```bash
bun install
bun run start        # scan the QR code with Expo Go, or press i / a
```

`.env` is committed on purpose. It holds only public values (the API URL and Clerk's publishable key), so a fresh clone works with no setup. The API is already deployed, so you don't need to run the server; to run it anyway, see [server/README.md](server/README.md).

### Testing tips

- **Lessons are real 10–15 minute videos.** You don't have to watch them: drag the seek bar past 90% and **Дуусгах** unlocks.
- **Start over:** Профайл → ⚙ Тохиргоо → **Ахиц дахин эхлүүлэх**. It also clears the name, so onboarding shows again.
- **Reset is for guests.** Signed-in learners see **Гарах** there instead, because their progress lives in the account.
- **Sign-in is optional.** Email sign-in uses a 6-digit code.

| Script                                            | What it does                                            |
| ------------------------------------------------- | ------------------------------------------------------- |
| `bun run check`                                   | typecheck + lint + format check + unit tests            |
| `bun run test`                                    | 134 unit tests (`bun test`)                             |
| `bun run start:e2e` then `bun run e2e`            | 7 Maestro end-to-end flows on a simulator, with Expo Go |
| `bun run build`                                   | bundles iOS and Android with `expo export` (smoke test) |
| `bunx eas-cli build --profile preview -p android` | installable APK through EAS                             |

## Technology

| Area            | Choice                                                                                 |
| --------------- | -------------------------------------------------------------------------------------- |
| App             | Expo SDK 58, React Native, TypeScript (strict), Expo Router, React Compiler            |
| State           | Zustand, persisted to AsyncStorage                                                     |
| Video           | `expo-video`, adaptive HLS, custom controls                                            |
| Motion          | Reanimated, Lottie, haptics, short sounds                                              |
| API             | Node 24, Hono + zod-openapi, Drizzle ORM                                               |
| Data            | PostgreSQL, Redis, Railway Bucket for video                                            |
| Accounts        | Clerk (optional)                                                                       |
| Tests           | `bun test` and Maestro for the app; Vitest against real Postgres and Redis for the API |
| Builds, hosting | EAS Build and EAS Update for the app, Railway for the API                              |

## Key architecture decisions

More detail, with the alternatives I rejected, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **Logic is pure and tested; React only renders it.** Unlock rules, XP, streaks, quiz scoring and path geometry are plain functions. They take `today` as a parameter, so tests don't depend on the clock. `src/progress/rules.ts` and `selectors.ts` have 100% line coverage.
- **Derived values aren't stored.** Status (done/active/locked), course %, level and averages are computed from saved progress, so they can't drift out of sync.
- **Lessons and quizzes share one ordered list.** "Unlock the next item" is a single rule for both.
- **Offline-first.** The UI reads only the local store, so every action is instant. Signed-in changes also go to a persisted outbox that syncs to the API.
- **The server re-checks the rules.** It grades quizzes and enforces the unlock order itself, and it answers `409 ITEM_LOCKED` for skipped items.
- **Feature folders.** `src/app` holds thin routes only. Each screen area lives in `src/features/<name>`.
- **Design tokens.** Every size and color comes from `src/theme/tokens.ts`, with matching light and dark palettes.
- **Typed translations, no i18n library.** `en.ts` is typed from `mn.ts`, so a missing key fails `tsc`.

### Rules I chose

- **Quiz pass mark:** 60% or more passes, so 3 of 5 is a pass. This follows the brief.
- **XP:** +10 per lesson and +20 for the first pass of a quiz. Re-watching or re-taking gives no XP, so points can't be farmed.
- **90% rule:** it uses the furthest point reached. Seeking forward counts, because the brief asks for seek and it keeps testing quick. A real release might count watched time instead.
- **Course %:** counts video lessons only, as in the brief's `7 / 10 хичээл · 70%`.
- **Video length:** I used real 10–15 minute lessons, as §2 describes, rather than the 30 s – 2 min samples §3.3 suggests. Seeking keeps testing fast.

## What's done

**P0: all done**

| Brief | Feature       | In the app                                                                                                                          |
| ----- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 3.1   | Path          | Zigzag path, units with titles, done/active/locked nodes, a distinct quiz node, and a message when a locked node is tapped          |
| 3.2   | Progress      | `5 / 10 хичээл · 50%` bar and total XP, updated after every lesson and quiz                                                         |
| 3.3   | Video lesson  | Play, pause, seek, title and number, description. Finish unlocks at 90%, gives +10 XP and opens the next item. Back keeps it active |
| 3.4   | Quiz          | 5 questions, 3 options each, progress bar, green/red check with the right answer, result screen with Continue and Retry             |
| 3.5   | Profile       | Name, initial avatar, XP, lessons done, quizzes passed, quiz average, course %                                                      |
| 3.6   | Tabs, storage | Home and Profile tabs. Progress survives restarts through AsyncStorage                                                              |
| 4     | Content       | 2 units, 10 lessons, 2 quizzes, and a locked unit 3                                                                                 |

**P1: all done.** Auto-scroll to the active lesson, streak, animated progress, fullscreen video, level, and reset.

**P2**

- Android and iOS builds
- Node.js API with PostgreSQL, live on Railway, with progress synced to it
- Login: Google, Apple or email code
- Streak and levelling (no daily goal setting)
- Lottie animations
- Dark mode
- Unit tests and Maestro end-to-end flows
- Offline handling: a banner, automatic video retry and queued sync
- Clean architecture with Zustand

**States:** a splash until data is ready, a video spinner, a video error with retry (it also retries when the connection returns), an offline banner, a crash screen, `—` before any quiz, and a redirect for deep links to locked lessons.

**Extras:** onboarding, video resume, quiz review, playback speed and quality, double-tap skip, sounds, Mongolian and English, study reminders, push notifications, and over-the-air updates.

## What's not done

- **Web version.** Expo Web isn't configured.
- **Content from the API.** The API serves the course, but the app still reads the bundled `src/course/course.json`. Progress syncs; content doesn't.
- **Leaderboard screen.** The API endpoint exists, but the app has no screen for it.
- **Other languages.** The language panel on Home shows them as "coming soon".
- **A1 lesson videos.** The videos are real Octolearn lessons about learning languages, not the A1 phrases themselves. The phrases stay in the lesson text and quizzes.
- **Production sign-in.** Clerk runs on its development instance, and Google and Apple use a browser sheet rather than native buttons.
- **TestFlight.** The iOS build is for the Simulator.
- **One Maestro flow is incomplete.** `07-account` passes sign-up and sync, then stops at the iOS sign-out alert: its tap doesn't register under Maestro. Sign-out and signing back in were tested by hand on both builds instead.
- **Account reset.** Signed-in learners can't reset their progress yet: the API has no endpoint for it, so the app hides the button.

## With more time

1. Fetch course content from the API with ETag caching, so lessons change without an app update.
2. Record A1 lessons with subtitles that highlight each phrase as it's spoken.
3. Count real watched time for the 90% rule.
4. Add the leaderboard screen and a daily goal.
5. Add the web client, generated from the API's OpenAPI document.
6. Add spaced repetition for missed quiz questions.
7. Run Maestro in CI, and add component tests and Dynamic Type checks.

## Time spent

About 25 hours in total, between 3 and 5 November 2026.

## AI usage

I used **Claude Code** (Anthropic) throughout, and it wrote a large share of the code under my direction.

- **Design:** researching patterns on Mobbin and exploring the UI as a clickable HTML prototype first.
- **App and API:** implementing features, tests and the Railway deployment setup.
- **Debugging:** tracing bugs I found on the simulator and on my iPhone.
- **Docs:** drafting this README and the write-ups in `docs/`.

I chose the product behaviour, the stack and the design direction, tested the flows, and can explain any file.

Third-party assets: the animated icons are from Iconly Pro. The mascot is OctoLearn's own Окто; no Duolingo logos, mascots or graphics are used.
