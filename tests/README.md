# Automated tests

Two layers, matching the manual test plan's numbering (e.g. `3.4`):

| Layer | Tool | Folder | Needs AWS? | Command |
| --- | --- | --- | --- | --- |
| Unit | Vitest | `tests/unit` | No — DynamoDB is faked | `npm test` |
| End-to-end | Playwright | `tests/e2e` | Yes — real sign-ins | `npm run test:e2e` |

## First-time setup

```bash
npm install
npx playwright install chromium
```

## Unit tests

`npm test` (or `npm run test:watch` while editing). These cover the business rules behind the plan:

- `billing.test.js`: what each plan allows (trial, Basic, Pro, staff)
- `subscriptions.test.js`: trial, subscribe, declined card, upgrade, downgrade, cancel/resume, programme packs, renewals, catch-up renewals, failed renewals, card updates, trainer removal when Pro ends
- `payments.test.js`: card validation, expired and declined cards
- `programs.test.js`: programme builder validation, kg/lb start weights, workout summary stats
- `restart.test.js`: restarting a programme deletes its run but keeps logged workouts, and a workout finished on a stale page doesn't bring the run back; restarting a week clears only that week
- `units.test.js`: height, body weight, lifting weight and tape measurement conversions
- `accounts.test.js`: password rules, profile completeness, modes per role
- `loginRedirect.test.js`: signed-out users sent to sign in and back, and redirects to other sites ignored

## End-to-end tests

Create `.env.e2e` in the project root (git-ignored) with one account per role:

```
# Optional — leave out to have Playwright start `npm run dev` on localhost:3000
E2E_BASE_URL=

E2E_ADMIN_EMAIL=
E2E_ADMIN_PASSWORD=
E2E_PT_EMAIL=
E2E_PT_PASSWORD=
E2E_BASIC_EMAIL=
E2E_BASIC_PASSWORD=
E2E_PRO_EMAIL=
E2E_PRO_PASSWORD=
```

Each account must be confirmed and have a completed profile (name, address, height, weight). The Basic account needs an active Basic plan or a trial with days left; the Pro account an active Pro plan; the PT account the PT role (Admin → Users). Tests for any role left blank are skipped.

**Use a dev/test environment, not production.** The trainer tests create and delete a programme template.

Then:

```bash
npm run test:e2e          # all, headless
npm run test:e2e:ui       # Playwright's UI, to watch and step through
npx playwright show-report
```

The `setup` project signs in once per role and saves the session to `tests/e2e/.auth/` (git-ignored). The `desktop` project runs everything except `mobile.spec.js`; the `mobile` project runs that on a Pixel 7-sized screen.

| Spec | Covers |
| --- | --- |
| `auth.spec.js` | Sign-in page, sign-up tab, wrong password, forgot password, sign out, signed-out redirects |
| `permissions.spec.js` | Modes per role; Basic blocked from Trainer/Admin; PT blocked from Admin; staff need no plan |
| `user.spec.js` | Home, settings, billing, measurements, reports, programme builder |
| `trainer.spec.js` | Trainer home and search, templates, kg/lb start weight saved and reopened, messages |
| `admin.spec.js` | Admin home, user search, can't delete yourself, exercise library form |
| `mobile.spec.js` | Main pages fit a phone screen |

## Still manual

These need emailed codes, change other people's accounts, or need dates to pass, so they stay in the manual test plan:

- Sign-up confirmation and password reset codes (2.1–2.3, 2.9–2.11)
- Real card payments through the UI (3.3–3.5, 3.8, 3.9); the rules behind them are unit tested
- Trial and plan expiry over time (3.12–3.15); unit tested with fixed dates
- Taking on and releasing clients, client programmes and trainer-led runs (5.4–5.17)
- Admin role changes, trainer assignment and deleting users (6.4–6.10)
- Logging workouts, rest timer, effort, notes (4.7–4.21)
- Chat between client and trainer (4.25)
