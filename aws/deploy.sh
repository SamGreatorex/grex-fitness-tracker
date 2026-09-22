#!/usr/bin/env bash
set -euo pipefail

# Deploys the Cognito User Pool + DynamoDB tables for grex-fitness-tracker.
# Safe to run repeatedly — the stack is updated in place.

PROFILE="${AWS_PROFILE:-sam-personal}"
REGION="${AWS_REGION:-eu-west-2}"
STACK="${STACK:-grex-fitness-tracker}"
APP_NAME="${APP_NAME:-grex-fitness-tracker}"

cd "$(dirname "$0")"

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

echo ""
echo "==> Done. Outputs (copy these into .env.local):"
aws cloudformation describe-stacks \
  --stack-name "$STACK" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --query "Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}" \
  --output table

echo ""
echo "==> Next: node scripts/seed-programs.js (to populate the Programs table)"
