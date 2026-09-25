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
node --env-file=.env.development.local scripts/seed-programs.js
node --env-file=.env.development.local scripts/seed-exercises.js

node --env-file=.env.production.local scripts/seed-programs.js
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

1. `./aws/deploy.sh dev` — creates the dev Cognito User Pool, the four dev
   tables, and the dev exercise-media S3 bucket.
2. Copy the printed outputs into `.env.development.local` (`ExerciseMediaBucketName`
   → `S3_EXERCISE_MEDIA_BUCKET`, `ExercisesTableName` → `DYNAMODB_TABLE_EXERCISES`, etc.).
3. `node --env-file=.env.development.local scripts/seed-programs.js`
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
