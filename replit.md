# NightOn — Replit.md

## Overview

NightOn is a mobile social/dating app built with Expo (React Native) that lets users discover nearby people, match with strangers via simulated voice calls, chat with matches, and post to a community board. The app targets iOS and Android (portrait-only) with a dark, nightlife-inspired aesthetic.

Core features:
- **Discover** — browse opposite-gender profiles filtered by language; shows age + distance in km (never city names); coin-gated calling (20 seeds) and messaging (5 seeds)
- **Match** — random opposite-gender matching; simulated 7-min call, then heart/X decision; mutual heart = friends
- **Friends** — list of matched friends with chat + block buttons; Blocked sub-tab with unblock option; conversations navigated to `/chat/[id]`
- **Board** — community posts filtered by user language; Popular (sorted by likes, gold #1 rank badge) and Latest (newest first) sub-tabs; photo posts + comments
- **Profile** — photo, nickname (50 seeds to change), bio (free), age, gender, location, language
- **App Settings modal** — language switcher + delete account; profile edit modal (nickname costs 50 seeds, bio is free)
- **Coin economy** — 0 seeds on signup; seedshop modal (5 packages: 50/$0.99 to 2000/$19.99, simulated); coin chip in Discover header opens shop
- **Multilingual** — English, Korean, Japanese, Spanish (i18n via `constants/i18n.ts`)

All user data and social content are **client-side only** (AsyncStorage); the backend is a mostly empty Express scaffold ready to be wired up.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK ~54 with `expo-router` v6 (file-based routing)
- **Navigation structure**:
  - `/` → index redirects based on auth state
  - `/(auth)/welcome` — login screen (Google / Apple, currently mocked)
  - `/(auth)/profile-setup` — onboarding form
  - `/(tabs)/` — main tab bar: Discover (`index`), Match, Friends, Board
  - `/chat/[id]` — individual chat screen
  - `/profile/[id]` — profile detail view
  - `/post/[id]` — post detail with comments
  - `/matching/calling` — simulated 7-minute call screen
  - `/matching/decision` — post-call keep/goodbye screen
- **Tab bar**: Uses `expo-glass-effect` / `NativeTabs` on iOS with Liquid Glass when available; falls back to standard `expo-router` `Tabs` on Android/Web with `BlurView` background on iOS.
- **State management**:
  - `AuthContext` — user profile, auth state, seeds, block list; persisted to `AsyncStorage` (`@nighton_user`)
  - `DataContext` — conversations, posts, fake profiles; persisted to `AsyncStorage`
  - `@tanstack/react-query` — set up for API calls but not heavily used yet (all data is local)
- **Styling**: All custom `StyleSheet`-based styles; dark theme via `constants/colors.ts` (charcoal palette, pink accent `#e8467c`, gold, teal)
- **Fonts**: Nunito (400, 600, 700, 800) via `@expo-google-fonts/nunito`
- **Animations**: `react-native-reanimated` v4 for pulse effects, spring animations, entry animations
- **Images**: `expo-image` for optimized rendering; `expo-image-picker` for profile/post photos
- **Haptics**: `expo-haptics` for feedback on interactions
- **Location**: `expo-location` used during profile setup to get city name
- **Keyboard handling**: `react-native-keyboard-controller` with web fallback using plain `ScrollView`

### Backend (Express — scaffold only)

- **Framework**: Express v5 (`server/index.ts`)
- **Routes**: `server/routes.ts` is a placeholder — no real routes yet, just creates an HTTP server
- **Storage**: `server/storage.ts` provides a `MemStorage` class (in-memory Map) implementing `IStorage` interface; not wired to anything yet
- **CORS**: Configured for Replit dev/prod domains and localhost

### Data Layer

- **Client persistence**: `AsyncStorage` for all user data, conversations, and posts
- **Database (not yet active)**: Drizzle ORM configured for PostgreSQL (`drizzle.config.ts` → `shared/schema.ts`); schema defines only a basic `users` table (id, username, password). The database is provisioned but the app does not query it yet.
- **Fake/simulated data**: `constants/fakeProfiles.ts` generates randomized profiles for the Discover and Match flows — there is no real user pool

### Authentication

- **Current state**: Mocked — `login("google" | "apple")` in `AuthContext` creates a local user profile in AsyncStorage with a generated ID; no real OAuth flow exists
- **Profile completeness check**: `isProfileComplete` gates entry to the main tab flow; incomplete profiles redirect to `/(auth)/profile-setup`

### Coin Economy

- seeds stored in `UserProfile.seeds` in AsyncStorage
- `spendseeds(amount)` returns `false` if insufficient balance
- `addseeds(amount)` simulates a purchase (no real payment integration)
- Nickname changes cost 50 seeds

### Internationalization

- `constants/i18n.ts` exports a `t(key, lang)` function returning strings for en/ko/ja/es
- Language stored per user in their profile

---

## External Dependencies

| Dependency | Purpose |
|---|---|
| `expo-router` | File-based navigation |
| `expo-location` | GPS city lookup during setup |
| `expo-image-picker` | Profile and post photo selection |
| `expo-image` | Optimized image rendering |
| `expo-blur` | Tab bar blur on iOS |
| `expo-glass-effect` | Liquid Glass tab bar (iOS 26+) |
| `expo-linear-gradient` | UI gradient backgrounds and buttons |
| `expo-haptics` | Tactile feedback |
| `expo-splash-screen` | Controlled splash screen |
| `@expo-google-fonts/nunito` | Custom font loading |
| `react-native-reanimated` | Animations |
| `react-native-gesture-handler` | Touch gesture support |
| `react-native-keyboard-controller` | Keyboard-aware scroll |
| `react-native-safe-area-context` | Safe area insets |
| `@tanstack/react-query` | API data fetching (scaffolded) |
| `@react-native-async-storage/async-storage` | Local data persistence |
| `drizzle-orm` + `drizzle-kit` | ORM for PostgreSQL (not yet active) |
| `pg` | PostgreSQL driver |
| `express` | Backend API server |
| `http-proxy-middleware` | Dev proxy for Expo ↔ Express |

### Not yet integrated (scaffold only)
- **Real OAuth** (Google / Apple Sign-In)
- **Real-time messaging** (WebSockets or similar)
- **Real voice calling** (WebRTC or a calling SDK)
- **Payment processing** (App Store / Google Play IAP)
- **PostgreSQL** (Drizzle schema exists but no queries are made)