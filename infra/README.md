# Infrastructure (Terraform)

Azure infrastructure for Impact Map. The architecture, costs, GitHub settings and the release
process are in [docs/deployment.md](../docs/deployment.md).

## Layout

```text
infra/
  .tflint.hcl              tflint settings (terraform + azurerm rules)
  bootstrap/               run once by an Owner: state storage, ACR, env resource groups, GitHub OIDC
  envs/dev/                dev environment (remote state key dev.tfstate)
  envs/prod/               prod environment (remote state key prod.tfstate)
  modules/
    network/               VNet, app + database subnets (delegated), NSGs
    monitoring/            Log Analytics workspace, workspace-based Application Insights
    database/              PostgreSQL Flexible Server (private, Entra ID only), private DNS, database
    app_service/           App Service plan, Linux web app, optional staging slot
    front_door/            Front Door profile, endpoint, routes, WAF policy, optional custom domain
    alerts/                availability test, e-mail action group + alert, budget
    diagnostic_setting/    diagnostic setting with only the categories the resource supports
```

Versions: Terraform `>= 1.9` (tested with 1.16.6), provider `hashicorp/azurerm ~> 5.10`. The
`.terraform.lock.hcl` files are committed (hashes for Linux, macOS and Windows).

Naming: `<type>-impactmap-<env>`, for example `rg-impactmap-dev`, `app-impactmap-dev-1a2b3c`.
Globally unique names get a 6-character suffix: a hash of the subscription ID and the name, so
the names stay the same when the state must be rebuilt. Tags on everything: `app=impact-map`,
`env`, `managed_by=terraform`.

## Order

| Step | Stack       | Who / where                                       | State                                 |
| ---- | ----------- | ------------------------------------------------- | ------------------------------------- |
| 1    | `bootstrap` | a person with Owner rights, locally, once         | local, can be migrated (see below)    |
| 2    | `envs/dev`  | GitHub Actions (push to `main`) or locally        | `tfstate/dev.tfstate`, Entra ID auth  |
| 3    | `envs/prod` | GitHub Actions (manual run + approval) or locally | `tfstate/prod.tfstate`, Entra ID auth |

## Bootstrap

Creates:

- `rg-impactmap-shared`: state storage account (`tfstate` container, versioning, soft delete,
  TLS 1.2, no public blobs, shared keys off, delete lock), the shared container registry (admin
  user off), and the GitHub identities.
- `rg-impactmap-dev`, `rg-impactmap-prod`.
- GitHub OIDC (user-assigned identities with federated credentials, no secrets):

  | Identity                   | Federated subject                      | Roles                                                                                                                                                                                                                                                 |
  | -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `id-impactmap-github-dev`  | `repo:<owner>/<repo>:environment:dev`  | Contributor + RBAC Administrator (ABAC: only `AcrPull` / `Monitoring Metrics Publisher` for service principals) on `rg-impactmap-dev`; on ACR: AcrPush, Reader, RBAC Administrator (ABAC: only `AcrPull`); Storage Blob Data Contributor on `tfstate` |
  | `id-impactmap-github-prod` | `repo:<owner>/<repo>:environment:prod` | the same for prod                                                                                                                                                                                                                                     |
  | `id-impactmap-github-plan` | `repo:<owner>/<repo>:pull_request`     | custom role "terraform plan reader" (`*/read` + list actions that the provider needs) on both env groups and ACR; Storage Blob Data Reader on `tfstate`                                                                                               |

- Resource provider registrations for all stacks (azurerm 5.x does not register providers by
  default, and the GitHub identities have no subscription rights).

Why RBAC Administrator on the registry: the env stacks give the app identity `AcrPull` on the
shared registry. The ABAC condition limits this right to exactly that role.

Run:

```bash
az login
export ARM_SUBSCRIPTION_ID="<subscription id>"
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars   # github_owner, github_repository, ...
terraform init
terraform apply
terraform output                               # values for the GitHub variables
```

Optional, migrate the bootstrap state into the storage account (wait a few minutes after the
apply, so that your new "Storage Blob Data Contributor" role is active):

```bash
cp backend.tf.example backend.tf
terraform output -json backend_hcl | jq -r .bootstrap > backend.hcl
terraform init -migrate-state -backend-config=backend.hcl
```

## Environment stacks (`envs/dev`, `envs/prod`)

The two stacks have the same `main.tf`; only the defaults in `variables.tf` differ (dev: small
SKUs; prod: a lean start with a staging slot, scaled up with variables). Inputs:

| Variable                                      | dev default         | prod default          | Notes                                                |
| --------------------------------------------- | ------------------- | --------------------- | ---------------------------------------------------- |
| `acr_name`                                    | (required)          | (required)            | bootstrap output `acr_name`                          |
| `app_service_sku`, `app_service_worker_count` | `B1`, 1             | `P0v3`, 1             | scale up: `P1v3`, 2                                  |
| `staging_slot_enabled`                        | `false`             | `true`                | prod deploys to the slot and swaps                   |
| `frontdoor_sku`, `waf_mode`                   | Standard, Detection | Standard, Prevention  | managed WAF rule sets only with Premium              |
| `api_rate_limit_per_minute`                   | 300                 | 300                   | WAF rate limit for `/api/` per client IP             |
| `postgres_sku`                                | `B_Standard_B1ms`   | `B_Standard_B2s`      | scale up: `GP_Standard_D2ds_v5`                      |
| `postgres_high_availability_enabled`          | `false`             | `false`               | scale up: `true` (zone-redundant; needs zones)       |
| `postgres_backup_retention_days`              | 7                   | 35                    |                                                      |
| `postgres_geo_redundant_backup_enabled`       | `false`             | `true`                | only at creation                                     |
| `log_retention_in_days`, `log_daily_quota_gb` | 30, 1               | 90, -1                |                                                      |
| `availability_test_*`                         | 3 locations, 900 s  | 3 locations, 900 s    | test on `https://<front door>/healthz`               |
| `alert_email`                                 | `null`              | `null`                | set to get an action group and an availability alert |
| `budget_amount`, `budget_contact_emails`      | `null`, `[]`        | `null`, `[]`          | monthly budget on the resource group                 |
| `custom_domain`                               | `null`              | `null`                | Front Door custom domain with managed certificate    |

GitHub Actions does not read `terraform.tfvars`. It uses the defaults plus the repository variable
`TFVARS_DEV` / `TFVARS_PROD` (a JSON object, for example `{"alert_email":"ops@example.com"}`) and
`ACR_NAME`. Keep local `terraform.tfvars` files in line with these variables.

Run locally:

```bash
cd infra/envs/dev
terraform -chdir=../../bootstrap output -json backend_hcl | jq -r .dev > backend.hcl
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
terraform output github_environment_variables   # AZURE_WEBAPP_NAME, FRONTDOOR_HOSTNAME
```

Outputs: `resource_group_name`, `app_service_name`, `staging_slot_name`,
`frontdoor_endpoint_hostname`, `acr_login_server`, `app_identity_client_id`, `app_identity_name`,
`postgres_fqdn`, `custom_domain_validation_token`, `custom_domain_cname_target`,
`github_environment_variables`.

## Who changes what

- **Terraform** owns the infrastructure and the app settings.
- **Deployments** own the container image tag. Terraform ignores changes of
  `docker_image_name`. A new web app starts with the tag `bootstrap`, which does not exist, so
  the app shows an error page until the first deployment.

## Checks

The same checks run in `.github/workflows/infra.yml`:

```bash
terraform fmt -check -recursive infra
for stack in infra/bootstrap infra/envs/dev infra/envs/prod; do
  terraform -chdir="$stack" init -backend=false -lockfile=readonly
  terraform -chdir="$stack" validate
done
(cd infra && tflint --init && tflint --recursive --config "$PWD/.tflint.hcl")
trivy config --severity HIGH,CRITICAL --ignorefile .trivyignore infra
```

Accepted Trivy findings and their reasons are in [`.trivyignore`](../.trivyignore).

## Destroying an environment

PostgreSQL server and database have `prevent_destroy`. To delete an environment on purpose,
remove these lines in `modules/database/main.tf` first, or delete the resources in Azure and
remove them from the state. The bootstrap state storage is protected by `prevent_destroy` and a
`CanNotDelete` lock.

## Troubleshooting

- **`MissingSubscriptionRegistration`**: run bootstrap again (it registers the resource
  providers) or `az provider register --namespace <namespace>`.
- **403 on the state or on role assignments right after bootstrap**: new role assignments can
  take up to 10 minutes to become active. Try again.
- **Custom domain stays "Pending"**: check the `_dnsauth` TXT record and the CNAME record.
- **Web app shows an error page after the first apply**: expected until the first deployment
  (see above).
