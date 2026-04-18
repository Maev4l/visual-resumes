# packages/infrastructure

Terraform for `visual-resumes.isnan.eu`.

## Conventions

Region `eu-central-1`, backend S3 bucket `global-tf-states` with `use_lockfile = true`, AWS provider `~> 6.0`. Reuses:
- Shared Cognito pool `platform-idp`
- `platform.idp.app-clients` SSM map (key `resumes` published by Plan 0a)
- Wildcard cert `*.isnan.eu` in `us-east-1`

## Prerequisites

1. **Plan 0a applied in `platform/idp`** — the `visual-resumes` client + group exist, `platform.idp.app-clients` contains `"visual-resumes": <client-id>`:
   ```bash
   aws ssm get-parameter --name platform.idp.app-clients --query 'Parameter.Value' --output text | jq '."visual-resumes"'
   ```
2. **Plan 0b applied** — `terraform-modules/lambda-trigger-apigw` rewritten and a new tag published. Update the `?ref=` in `apigw.tf` to that tag.
3. **Stub container images in ECR** — see Bootstrap below.

## Bootstrap (first-time apply)

Lambda container functions require their ECR images to exist before `terraform apply`. Sequence:

```bash
terraform -chdir=packages/infrastructure init

# Create ONLY the ECR repos so we can push into them
terraform -chdir=packages/infrastructure apply \
  -target=aws_ecr_repository.renderer \
  -target=aws_ecr_repository.image_resizer \
  -auto-approve

# Build stub api.zip and push stub images
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo eu-central-1)
packages/functions/scripts/bootstrap.sh "$ACCOUNT_ID" "$REGION" latest

# Full apply
terraform -chdir=packages/infrastructure apply -auto-approve

# Deploy placeholder index.html
packages/editor/scripts/deploy-placeholder.sh
```

## Day-to-day

- `yarn infra:plan`
- `yarn infra:apply`
- `yarn infra:output`

## Variables

| Name | Default |
|---|---|
| `region` | `eu-central-1` |
| `domain_name` | `visual-resumes.isnan.eu` |
| `hosted_zone_name` | `isnan.eu` |
| `cognito_hosted_ui_origin` | `https://platform-idp-auth.isnan.eu` |
| `image_tag` | `latest` (deploy pipeline overrides to git SHA) |
| `log_retention_in_days` | `7` |
