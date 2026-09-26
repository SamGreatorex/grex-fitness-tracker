# Environment setup

This app runs against **two fully separate AWS environments** — dev and
prod — each with its own Cognito User Pool, DynamoDB tables, and S3 bucket.
Nothing in the app code knows about "dev" or "prod"; it only ever reads
table/bucket/pool names from environment variables, so which environment
you're pointed at is purely a matter of which env file (locally) or which
Amplify branch config (deployed) is active.

## Local: two env files, not one

Next.js natively loads `.env.development.local` when running `npm run dev`,
and `.env.production.local` when running `npm run build && npm start` —
both are gitignored, same as `.env.local` was before. Put the **full** set
of variables in each (don't split values between this and a shared
`.env.local` — that gets confusing about which environment you're actually
pointed at):

```
# Client-side (exposed to the browser, used by Amplify Auth)
NEXT_PUBLIC_AWS_REGION=eu-west-2
NEXT_PUBLIC_COGNITO_USER_POOL_ID=
NEXT_PUBLIC_COGNITO_CLIENT_ID=

# Server-side only (used by API routes and scripts/*.js)
AWS_REGION=eu-west-2
DYNAMODB_TABLE_PROGRAMS=grex-fitness-tracker-dev-programs
DYNAMODB_TABLE_RUNS=grex-fitness-tracker-dev-program-runs
DYNAMODB_TABLE_SESSIONS=grex-fitness-tracker-dev-workout-sessions
DYNAMODB_TABLE_EXERCISES=grex-fitness-tracker-dev-exercises
DYNAMODB_TABLE_USERS=grex-fitness-tracker-dev-users
DYNAMODB_TABLE_MEASUREMENTS=grex-fitness-tracker-dev-body-measurements
S3_EXERCISE_MEDIA_BUCKET=

AWS_PROFILE=sam-personal
```

(`.env.production.local` looks identical, just with the unsuffixed
`grex-fitness-tracker-*` names from the prod stack.)

The server-side AWS SDK calls (API routes, seed scripts) pick up credentials
from the default provider chain — i.e. whatever `aws configure` /
`AWS_PROFILE` already gives you locally. No access keys need to be
hardcoded.

`next dev` loads `.env.development.local` automatically. The seed scripts
are plain Node, so point them at whichever environment you mean to seed:

```
node --env-file=.env.development.local scripts/seed-programs.js you@example.com
node --env-file=.env.development.local scripts/seed-exercises.js

node --env-file=.env.production.local scripts/seed-programs.js you@example.com
node --env-file=.env.production.local scripts/seed-exercises.js
```

## Deploying each environment's AWS stack

`./aws/deploy.sh` takes an environment argument. Both are the *same*
CloudFormation template — the argument just picks which resource names it
deploys under, so the two stacks never collide:

```
./aws/deploy.sh dev     # creates/updates grex-fitness-tracker-dev-*
./aws/deploy.sh prod    # creates/updates grex-fitness-tracker-* (the original, unsuffixed stack)
```

`prod` always resolves to the original unsuffixed names, so it keeps
updating the existing live stack — it will never rename or recreate it.
Running with no argument at all is the same as `prod`.

1. `./aws/deploy.sh dev` — creates the dev Cognito User Pool, the six dev
   tables, and the dev exercise-media S3 bucket.
2. Copy the printed outputs into `.env.development.local` (`ExerciseMediaBucketName`
   → `S3_EXERCISE_MEDIA_BUCKET`, `ExercisesTableName` → `DYNAMODB_TABLE_EXERCISES`, `UsersTableName` → `DYNAMODB_TABLE_USERS`, `BodyMeasurementsTableName` → `DYNAMODB_TABLE_MEASUREMENTS`, etc.).
3. `npm run dev`, sign up, then `node --env-file=.env.development.local scripts/seed-programs.js you@example.com`
4. `node --env-file=.env.development.local scripts/seed-exercises.js`
5. `npm run dev` — sign up a *dev* user (this pool is separate from prod,
   so prod accounts don't exist here), start a program.

Repeat with `./aws/deploy.sh prod` and `.env.production.local` for the
production stack — or skip it if prod is already deployed and you're only
setting up dev.

## Deployed (Amplify Hosting)

Amplify Hosting doesn't read any local `.env*` file — its own env vars
(App settings → Environment variables, and/or per-branch overrides) are
the only thing that reaches the deployed SSR compute (see `amplify.yml`,
which writes them into `.env.production` at build time). The existing
`main` branch's env vars already point at the prod stack from before this
change — nothing there needs to move.

To get a *deployed* dev environment (not just local `npm run dev`), connect
a second branch (e.g. `dev`) to this same Amplify app in the Console, and
set that branch's own environment variables to the dev stack's outputs
from step 2 above. Each Amplify branch gets its own URL, so dev and prod
end up served from entirely separate domains, backed by entirely separate
data.

## User roles

Every user gets a row in the `*-users` table (keyed by their Cognito
`sub`) the first time they sign in, with `role` = `basic`. To make someone
a PT or admin, an admin can change it from Admin mode → Users, or you can
edit that row's `role` attribute directly in DynamoDB to `pt` or `admin`.
The very first admin has to be set in DynamoDB, since nobody can reach the
Users page until then (and admins can't change their own role).

Roles decide which modes appear in the header's mode switcher: basic users
only get User mode (and no switcher), PTs get User + Trainer, admins get
User + Trainer + Admin. The exercise library lives under Admin mode, and
its write API routes are admin-only. Server routes gate on roles with
`requireRole(request, [ROLES.ADMIN])` from `src/lib/users.js`.

Profile pictures are uploaded to the exercise-media bucket under
`avatars/<userId>/`.

## Programmes belong to users

Every programme has an `ownerUserId` (the owning user's Cognito sub) and
users only ever see their own. In Trainer mode a PT sees their own
clients plus users with no PT, can take an unassigned user on as a
client (sets `ptUserId` on that user's row), release them again, and
create/edit/delete programmes only for their own clients — they can't
see anyone assigned to another PT. Admins can manage any user's
programmes, and reassign clients from Admin mode → Users. Demoting a PT
to Basic releases all of their clients.

Programmes created before this change have no owner and won't show up
for anyone until assigned. Once `./aws/deploy.sh` has added the
`OwnerIndex` index, sign in once, then:

```
node --env-file=.env.production.local scripts/assign-programs-to-user.js you@example.com --dry-run
node --env-file=.env.production.local scripts/assign-programs-to-user.js you@example.com
```

That only sets `ownerUserId` — same programme IDs, so existing runs and
logged workouts stay attached. It warns if any other user has runs on
those programmes (they'd need their own programmes built by a PT).

## Body measurements

Weight and tape measurements (neck, shoulders, chest, waist, hips, arms,
legs, calves) are logged at `/measurements`, one entry per user per day,
in the `*-body-measurements` table (`DYNAMODB_TABLE_MEASUREMENTS`).
Values are stored metric and shown in the user's profile units. Logging
a weight also updates the profile's current weight. Trends appear in the
Body section of Progress reports.
