# OctoLearn — video course prototype

A Duolingo-style mobile prototype for learning English: a zigzag learning path, video lessons, unit quizzes and a profile. The UI is in Mongolian (default) and English. Built with **Expo SDK 58 + TypeScript** for iOS and Android.

## Run it

Requirements: Node **22.13+**, [Bun](https://bun.sh), and Expo Go 58 on a phone or simulator.

```bash
bun install
bun run start        # scan the QR code with Expo Go, or press i / a
```

Everything runs in **Expo Go**. There are no custom native modules, so no dev build is needed.

| Script                                            | What it does                                            |
| ------------------------------------------------- | ------------------------------------------------------- |
| `bun run check`                                   | typecheck + lint + format check + unit tests            |
| `bun run test`                                    | unit tests (`bun test`, 49 tests)                       |
| `bun scripts/send-push.ts <token>`                | send a test remote push to a device build               |
| `bun run e2e`                                     | All Maestro end-to-end flows on a simulator (Metro on)  |
| `bun run build`                                   | bundles iOS and Android with `expo export` (smoke test) |
| `bunx eas-cli build --profile preview -p android` | installable APK via EAS                                 |

## What's in it

**P0 (all done)**

- **Home path:** lessons and quizzes on a zigzag path, each done, active or locked. Tapping a locked item shakes it and says what to finish first. Unit banners stick to the top while you scroll.
- **Header:** course progress (`5 / 10 хичээл · 50%`), streak and total XP.
- **Video lesson:** streaming video (`expo-video`) with native play, pause, seek and fullscreen. **Finish** unlocks at 90% watched or at the end, and the button fills as you watch. Finishing gives **+10 XP** and unlocks the next item.
- **Quiz:** 5 questions per unit with 3 options each. Check gives instant green/red feedback plus the right answer. The result screen shows the score; **60%** passes and unlocks the next unit. Continue and Retry are both offered.
- **Profile:** name, initial avatar, level, streak, XP, lessons done, quizzes passed, average best score, course %, and a 7-day activity chart.
- **Tabs:** native tab bar (Liquid Glass on iOS 26, Material 3 on Android).
- **Persistence:** progress is saved to the device (AsyncStorage) and restored before the splash screen hides.

**P1:** streak, reset progress (with confirmation), auto-scroll to the current lesson, fullscreen video, animations (confetti, medal, unlock pop, XP count-up, shake, haptics).

**Extras:**

- **Welcome screen:** the first launch asks for the learner's name, which the profile and avatar use. Expo Router's `Stack.Protected` swaps it for the tabs once a name is saved.
- **Video resume:** leaving a lesson halfway keeps both the playback position and the progress toward 90%.
- **Quiz review:** a native sheet from the result screen lists each question with your answer and, if it was wrong, the right one. Mistakes come first.
- **Sounds:** short correct, wrong and complete tones (synthesised for this app with ffmpeg), with an on/off switch. They follow the iOS silent switch.
- **Mongolian and English:** Profile → Тохиргоо → Хэл (Систем, Монгол, English). The whole UI switches live, including tabs, alerts, accessibility labels and notification text. Unit and lesson titles and descriptions are translated too. Lesson phrases and quiz questions stay Mongolian ↔ English because they are the course itself. "System" follows the phone's language and falls back to Mongolian.
- **Dark mode:** follows the system or can be set in Profile → Тохиргоо (System, Light, Dark).
- **Study reminders:** Profile → Тохиргоо → Өдөр бүрийн сануулга (09:00, 13:00, 19:00 or 21:00). These are local notifications, so they work in Expo Go too. The next 7 days are scheduled one by one and re-planned whenever progress changes, so a day you've already studied gets no reminder and the first one warns about a streak at risk. Tapping a notification opens the app.
- **Push notifications:** on a real device build, turning reminders on also registers an Expo push token (Profile → Push токен хуваалцах). `bun scripts/send-push.ts "<token>" [/path]` sends a test push the way a backend would, and the path opens on tap.
- **Over-the-air updates:** `expo-updates` checks once per launch, downloads in the background, and shows a "Шинэ хувилбар бэлэн" banner to restart into it. Profile shows the running version and update id.

**P2:** both platforms from one codebase, dark mode, Lottie animated icons, Zustand state management, unit tests (100% line coverage of the logic) plus six Maestro end-to-end flows covering every screen, offline handling.

**States:** loading (splash until data is ready, video spinner), error (video error with retry and automatic retry when the connection returns; a crash screen via Expo Router's `ErrorBoundary`), offline banner, empty states (`—` before any quiz), and a guard that redirects deep links to locked or unknown lessons to Home.

## Project structure

```
src/
  app/                  Expo Router routes only — thin files that read params, guard, render a screen
    (tabs)/             Home and Profile tabs (NativeTabs)
    lesson/[id]/        video lesson + completion screen
    quiz/[id]/          quiz, result screen, review sheet
    welcome.tsx         first-run onboarding (3 questions, reminder, name)
  features/             one folder per screen area: screens, their private components, their logic
    home/ lesson/ quiz/ profile/ onboarding/
  course/               course.json + types + the ordered learning path
  progress/             rules (pure), selectors (pure), store (Zustand + AsyncStorage)
  settings/             theme, sound and reminder preferences (kept when progress is reset)
  notifications/        reminder planning (pure, tested), scheduling, push token, tap handling
  components/           shared UI: ui/ primitives (text, button, icons…), mascot, toast, confetti
  hooks/  lib/          small reusable hooks and helpers
  i18n/                 mn.ts (source) and en.ts message catalogs, locale hooks
  theme/                tokens (light + dark palettes, 4pt spacing, radius, type scale) and hooks
.maestro/               end-to-end test of the core flow
scripts/send-push.ts    test remote push through Expo's push service
```

It follows Expo's recommended layout (`src/app` for routes only, kebab-case files, tests next to the code they test) and organises screens by feature.

## Push and OTA setup (one-time, needs your Expo account)

These need an EAS project, so they are off until it is linked. Nothing below is needed for Expo Go.

```bash
bunx eas-cli@latest init                 # link/create the EAS project (adds the projectId)
bunx eas-cli@latest update:configure     # adds the update URL, runtime version and build channels
bunx eas-cli@latest build -p android --profile preview          # installable APK on the "preview" channel
bunx eas-cli@latest update --channel preview --message "..." --environment preview   # ship JS/asset changes OTA
```

An installed build picks an update up within up to two cold launches (download, then apply), or right away through the in-app banner. Native changes, such as new native libraries, still need a new build.

- **Android push:** add Firebase credentials (`google-services.json`, FCM v1 key) with `eas credentials`.
- **iOS push:** needs an Apple Developer account for the APNs key.
- **Expo Go limits:** Expo Go on Android can't receive remote push (local reminders still work).

## Key decisions

- **Logic is pure and tested; React only renders it.** Unlock rules, XP, streaks, quiz scoring, path geometry and the quiz state machine are plain functions. They take `today` as a parameter, so tests don't depend on the clock. The store only calls them.
- **Derived values aren't stored.** Status (done/active/locked), course %, level and averages are computed from the saved progress, so they can never drift out of sync.
- **Lessons and quizzes share one ordered list.** "Unlock the next item" is a single rule for both.
- **Native video controls.** They are familiar, accessible and handle fullscreen. We add only the loading, error and retry states, plus the 90% gate.
- **The 90% rule** uses the furthest point reached. Seeking forward is allowed because the brief asks for seek; it only gates the Finish button. Re-watching a finished lesson is allowed and gives no XP. Quiz XP is given only on the first pass, so retakes can't farm points.
- **Design tokens.** Every size comes from `theme/tokens.ts`: 4pt spacing, 5 radius steps, 6 type sizes in one font (Onest, full Cyrillic including Ө/Ү), and 44pt+ touch targets.
- **Typed translations, no i18n library.** `mn.ts` is the source catalog and `en.ts` is typed as `Messages = typeof mn`, so a missing key or a wrong signature fails `tsc` (a test also checks that the two catalogs have the same shape). Messages that take values are functions, so word order and English plurals work naturally. Pure logic returns data, for example a lock reason or a weekday number, and the UI words it in the active language.
- **Dark mode through tokens.** Light and dark palettes share the same role names, and components read them through `useColors` / `makeStyles`, which caches one StyleSheet per theme. Every text color passes WCAG AA in both themes. The Profile setting calls `Appearance.setColorScheme`, so native tabs and alerts switch too.
- **Expo Go compatible.** Every library ships in Expo Go, so reviewers can run the app without building anything.

## Assumptions and things skipped

- No backend or login: the learner is a local profile created in onboarding. Content comes from `src/course/course.json`.
- The videos are public 10-second sample clips (Big Buck Bunny, Sintel, Jellyfish). They are placeholders, not real lesson content.
- The web build isn't configured.

## With more time

- Real lesson videos (HLS) with subtitles that highlight each phrase as it is spoken.
- A Node.js + SQL backend with accounts, syncing progress across devices.
- Spaced-repetition review of missed quiz questions.
- Dynamic Type checks, component tests, and running the Maestro flow in CI.

## AI usage

Built with Claude Code (Anthropic) as a pair programmer:

- The UI was first explored as a clickable HTML prototype from Mobbin research.
- The app was then scaffolded and written from that prototype, following the official Expo skills and the SDK 58 docs.
- I reviewed the code, ran it on the iOS Simulator, and drove each flow (lesson → quiz fail/pass → restart persistence). Two navigation bugs found that way were fixed: a quiz-exit loop and the leave confirmation.
- All decisions above are mine and I can walk through any file.

## Time spent

_Fill in before submitting._
