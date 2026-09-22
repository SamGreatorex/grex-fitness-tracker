# Environment setup

Create a `.env.local` file in the project root (it's gitignored) with the
outputs from `./aws/deploy.sh`:

```
# Client-side (exposed to the browser, used by Amplify Auth)
NEXT_PUBLIC_AWS_REGION=eu-west-2
NEXT_PUBLIC_COGNITO_USER_POOL_ID=
NEXT_PUBLIC_COGNITO_CLIENT_ID=

# Server-side only (used by API routes and scripts/*.js)
AWS_REGION=eu-west-2
DYNAMODB_TABLE_PROGRAMS=grex-fitness-tracker-programs
DYNAMODB_TABLE_RUNS=grex-fitness-tracker-program-runs
DYNAMODB_TABLE_SESSIONS=grex-fitness-tracker-workout-sessions
DYNAMODB_TABLE_EXERCISES=grex-fitness-tracker-exercises
S3_EXERCISE_MEDIA_BUCKET=

AWS_PROFILE=sam-personal
```

The server-side AWS SDK calls (API routes, seed scripts) pick up credentials
from the default provider chain — i.e. whatever `aws configure` / `AWS_PROFILE`
already gives you locally. No access keys need to be hardcoded.
`AWS_PROFILE=sam-personal` in `.env.local` matches what `./aws/deploy.sh`
defaults to. `next dev` loads `.env.local` automatically for the API routes;
the seed scripts are plain Node, so load it explicitly when running those:

```
node --env-file=.env.local scripts/seed-programs.js
node --env-file=.env.local scripts/seed-exercises.js
```

## Deploy order

1. `./aws/deploy.sh` — creates/updates the Cognito User Pool, the Programs,
   ProgramRuns, WorkoutSessions and Exercises tables, and the exercise media
   S3 bucket.
2. Copy the printed outputs into `.env.local` as above (`ExerciseMediaBucketName`
   → `S3_EXERCISE_MEDIA_BUCKET`, `ExercisesTableName` → `DYNAMODB_TABLE_EXERCISES`).
3. `node --env-file=.env.local scripts/seed-programs.js` — populates the
   Programs table from `data/fitness-plan.json`.
4. `node --env-file=.env.local scripts/seed-exercises.js` — populates the
   Exercises table with every exercise referenced across the 5 programs
   (name only — no tags or media yet; add those from `/admin/exercises`).
5. `npm run dev` — sign up a user (real email, Cognito sends a confirmation
   code), sign in, start a program.
