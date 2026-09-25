#!/usr/bin/env bash
set -euo pipefail

# Deploys the Cognito User Pool + DynamoDB tables + S3 bucket for
# grex-fitness-tracker. Safe to run repeatedly — the stack is updated in
# place, never recreated.
#
# Usage:
#   ./aws/deploy.sh          # prod (default) — same stack/names as always
#   ./aws/deploy.sh prod     # same as above, explicit
#   ./aws/deploy.sh dev      # separate stack: its own Cognito pool, tables,
#                            # and S3 bucket, fully isolated from prod
#
# "prod" always resolves to the original unsuffixed names
# (grex-fitness-tracker-*) so it keeps updating your existing live stack —
# it will never rename or recreate it. "dev" gets a distinct
# grex-fitness-tracker-dev-* stack, so dev testing never touches prod data.
# Override APP_NAME/STACK explicitly if you want something else entirely.

ENVIRONMENT="${1:-prod}"
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
  echo "Usage: $0 [dev|prod]" >&2
  exit 1
fi

if [[ "$ENVIRONMENT" == "prod" ]]; then
  DEFAULT_NAME="grex-fitness-tracker"
else
  DEFAULT_NAME="grex-fitness-tracker-dev"
fi

PROFILE="${AWS_PROFILE:-sam-personal}"
REGION="${AWS_REGION:-eu-west-2}"
STACK="${STACK:-$DEFAULT_NAME}"
APP_NAME="${APP_NAME:-$DEFAULT_NAME}"

cd "$(dirname "$0")"

echo "Environment: $ENVIRONMENT"
echo "Profile:  $PROFILE"
echo "Region:   $REGION"
echo "Stack:    $STACK"

echo "==> Deploying CloudFormation stack '$STACK'..."
aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file template.yml \
  --parameter-overrides "AppName=${APP_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --profile "$PROFILE"

ENV_FILE=".env.development.local"
if [[ "$ENVIRONMENT" == "prod" ]]; then
  ENV_FILE=".env.production.local"
fi

echo ""
echo "==> Done. Outputs (copy these into ${ENV_FILE}):"
aws cloudformation describe-stacks \
  --stack-name "$STACK" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --query "Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}" \
  --output table

echo ""
echo "==> Next: node --env-file=${ENV_FILE} scripts/seed-programs.js (to populate the Programs table)"
