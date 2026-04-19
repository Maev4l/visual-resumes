#!/usr/bin/env bash
set -euo pipefail

ACCOUNT_ID="${1:?usage: push.sh <account-id> <region> [tag]}"
REGION="${2:?usage: push.sh <account-id> <region> [tag]}"
TAG="${3:-latest}"

REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/visual-resumes-image-resizer"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

docker tag  "visual-resumes-image-resizer:$TAG" "$REPO:$TAG"
docker push "$REPO:$TAG"
echo "pushed $REPO:$TAG"
