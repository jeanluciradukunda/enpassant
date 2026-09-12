# Infrastructure and delivery

**Current launch baseline:** [EC2 with optional Fargate analysis](aws-baseline.md), with a modeled $22–$27/month recurring range and roughly $25 target. Keep public-library hosting, optional engine usage and temporary learning labs as separate allocations. The topology is proposed, not provisioned.

## Deployment shape

| Component                           | Initial placement                                               | Boundary                                                                                  |
| ----------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| React assets and public HTTPS       | Caddy on EC2                                                    | Cache versioned public assets; never shared-cache private API/auth responses              |
| TypeScript API and application auth | Compose service on the same EC2 host                            | Ownership, sessions, quotas and the worker broker                                         |
| Import/coordinator worker           | Bounded Compose service                                         | Durable Postgres queue, provider limiter and scoped connector credentials                 |
| PostgreSQL                          | Container on persistent encrypted EBS                           | No public DB port; restricted runtime roles and bounded connection pools                  |
| Raw PGNs and immutable artifacts    | Private EBS volume initially; S3 for larger artifacts as needed | Authorized access, immutable keys, explicit retention and off-host backups                |
| Ordinary engine and graph work      | Browser workers                                                 | Locally useful guest interaction; save results with device provenance                     |
| Optional native engine              | Standalone ECS Fargate task, Phase 3                            | Scoped broker grants; no inbound port or DB/OAuth access; exits after bounded work        |
| Transactional mail                  | Verified SMTP provider within a measured allowance              | Signup and recovery throttles; no assumed unlimited free delivery                         |
| Terraform state                     | Restricted encrypted/versioned S3 backend                       | Separate from application data and backup objects; locking and distinct environment state |

Use the [AWS network and pricing assumptions](aws-baseline.md#networking-and-public-access). N. Virginia is the price reference only; validate latency and regional costs before choosing production. The small ARM host must pass memory, CPU-credit, import and recovery tests. Start with one import at a time; build images in CI.

Begin with small database pools, for example five API connections and three import/coordinator connections plus migration/operations headroom. Derive tenant context inside each explicit transaction. Verify RLS isolation after commit, abort and connection reuse with the actual local Postgres roles. A separate pooler is not required merely because the managed alternative uses one.

The [older runtime diagram](diagrams/runtime.svg) retains Render/Supabase placement for comparison. Managed identity, paid database backups and transaction-pooler behaviour apply only if that alternative is selected.[^supabase-connections]

## Terraform ownership

Terraform owns the VPC, subnet/routes, internet gateway, security groups, EC2 instance/profile, persistent EBS policy, public IP, Route 53 records, storage/state access, IAM/OIDC trust and optional ECS task definitions. Pin the AWS provider and inspect its schema during the infrastructure spike. Terraform does not own application tables or runtime database credentials.

Proposed layout, to create during implementation:

```text
infra/
  modules/
    network/             # VPC, routes, security groups
    host/                # EC2, EBS, instance role and bootstrap
    dns/                 # hosted zone and application records
    storage/             # private artifacts, backups and access policy
    studies/             # optional ECS/Fargate definitions and reaper
  environments/
    staging/             # temporary isolated resources and state
    production/          # independent resources and state
packages/db/migrations/  # schema, grants, RLS, indexes; not Terraform
ops/                     # Compose, release scripts, runbooks and capacity evidence
```

Separate Terraform resource ownership from Compose/release image promotion and SQL migrations. Releases pin tested image digests; Terraform must not revert them during an unrelated network change. If a worker image field needs a narrow ignore rule, document it; never ignore entire service configurations. Use a constrained Systems Manager deployment entry point for EC2.

GitHub OIDC grants short-lived AWS access only to the intended trusted repository/ref or protected environment, with the actual subject format verified. Keep PR validation without cloud credentials. The [CI/CD controls](ci-cd-and-costs.md#workflow-permissions-and-production-controls) govern trusted plans, serialized applies and exact-release promotion. Optional workers, the coordinator, host administration and deployment have distinct permissions; narrow ECS launch and `iam:PassRole` grants to approved task definitions and roles.

Compose does not supply a task IAM role per container. Deny application containers access to the configured IPv4/IPv6 instance-metadata endpoints, omit privileged/host-network modes and Docker socket access, and test the actual container packet path. IMDSv2 alone is not proof of container separation. The host SSM agent and a constrained dispatcher may retain the specific instance-role permissions they need; the dispatcher accepts an admitted attempt ID and resolves fixed launch parameters rather than acting as an arbitrary AWS proxy. [Metadata access controls](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-metadata-limiting-access.html).

The SSM deployment contract must name a fixed document/version and a root-owned release script with validated immutable release parameters. Separate authority to invoke that document from authority to replace it, edit the script or open an administrative session. Scoping an arbitrary shell command to one instance still trusts the caller with that host. Test wrong documents, refs, images and injected parameters. [SSM privilege boundary](https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent-restrict-root-level-commands.html).

Use a versioned/encrypted S3 state bucket with public access blocked and current `use_lockfile` locking. Record initial state-bucket bootstrap and recovery separately. HashiCorp documents DynamoDB S3 locking as deprecated. Restrict state and saved plans: `sensitive = true` does not remove values from them.[^tf-s3][^tf-secrets]

Routine tests use disposable Compose/Postgres and synthetic provider fixtures. Temporarily provision isolated staging for real HTTPS/OAuth and release/restore exercises, retaining evidence and cleaning up its billable resources afterwards. Staging has separate identities, callback URLs, data, secrets and Terraform state; it cannot borrow production credentials to save money. Price retained disks, state, DNS and logs as well as running instances.

The managed alternative uses the providers' separate Terraform integrations and may need vendor management tokens. It is not a dependency of the AWS path.[^render-tf][^supabase-tf]

## Build, deploy and rollback

The [CI/CD proposal](ci-cd-and-costs.md#delivery-pipeline) makes this sequence concrete, using the existing GitHub Actions verification. It also identifies the private-repo plan restrictions: a GitHub Pro/Team private environment does not provide required deployment reviewers. The proposed lean fallback is an explicit authorized-maintainer promotion, not a claim of independent approval.

Continue the pinned pnpm/Node workflow. Build the API, worker and web bundles from the same commit, record dependency and engine manifests, and publish immutable artifacts. Keep Stockfish binary/NNUE source and license provenance with the release. Diagram policy and API schemas are versioned so a worker or browser cannot misread a newer result silently.

The deployment sequence is: run contract/unit/browser checks; build artifacts; apply additive database migrations; deploy API compatible with old and new result schemas; deploy workers; publish frontend; run smoke tests; then retire old schema support only after active jobs and cached clients are handled. An old worker remains pinned to its supported schema, drains or is replaced—it does not guess at a new payload.

Use expand/contract migrations. A failed frontend/API release rolls back to the previous artifact. A destructive database migration is not rolled back blindly with an old SQL file; prefer a forward repair or tested restore. Do not delete old result/artifact versions while active studies reference them. Queued jobs record the contract version and can be rejected or migrated deliberately during deployment.

Before a release, verify readiness without invoking the engine: database access, required schema version, signing/encryption configuration and queue admission. Liveness reports a running process; readiness reports safe traffic handling. Graceful shutdown stops claiming new jobs, finishes or releases leases, and prevents a killed worker from publishing after replacement.

## Data protection and operational access

For EC2, schedule consistent Postgres backups and immutable artifact copies off the host, with checksums and a shared recovery manifest. Protect the independent deletion/revocation journal and encryption-key recovery path. EBS retention and container volumes do not replace backups. In the managed alternative, Supabase database backups exclude the stored objects, so that design also requires a separate artifact backup.[^backups]

Initial beta targets are **RPO 24 hours and RTO 8 hours**, subject to a successful timed restore exercise. These are appropriate only if disclosed for a beta; do not advertise tighter recovery without PITR and a tested object strategy. If loss of even a day's annotations is unacceptable, buy the appropriate PITR/backup capacity before launch. For the EC2 baseline, prove the backup schedule and retention against these targets. Supabase Pro daily backups and paid PITR are features of the retained managed alternative, not capabilities already present on our host.[^supabase-pricing]

Replicate private immutable artifacts daily to an independently controlled backup store, verify checksums and retain enough versions to cover the database retention window. A backup manifest records the covered cutoff and object keys. Because artifacts are immutable, an object backup may safely contain a superset of a restored database's references. A missing referenced object is a restore failure, not a silently empty game.

Restore into isolated staging, reset custom-role credentials as necessary, restore the token-encryption key ring through its separate recovery channel, and replay the independently retained deletion/suspension/unlink/share-revocation journal. Invalidate restored application sessions. Verify Auth mappings, library reads, objects, RLS, quotas and jobs before routing traffic. In-flight leases become expired; replay the restored outbox only after tombstones and outstanding budget obligations are reconciled. Revalidate retained connections before authenticated sync resumes. Provider imports can often be fetched again; private annotations and uploads cannot be reconstructed from an engine run.

Log request/trace IDs, opaque user/job IDs, timings, counts and error classes. Exclude tokens, PGNs, full OAuth callback queries, email OTPs and private annotations. Sample provider errors after redaction. Limit access to audit logs, state, backups and production consoles; administrative actions require MFA and an audit reason. Support access is a time-limited grant to a specific issue/resource, not a hidden global library browser.

Proposed retention defaults: thirty days for routine request logs, ninety days for minimal security audit events, seven days for abandoned imports/pending artifacts, one day for generated export download links, and explicit owner deletion for retained library content. Security/legal retention requirements must be checked for the actual operating jurisdiction before publication; no jurisdiction-specific compliance claim is made by this design.

## Reliability and observability

| Signal                   | Initial target or action                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Private API availability | 99.5% beta target; measure independently of optional provider imports                          |
| Library API latency      | p95 below 300 ms server time under the declared load fixture                                   |
| First atlas chunk        | p95 below 2 seconds when cached; builds show progress, not a spinning empty page               |
| Graph interaction        | Smooth replay on representative desktop/mobile; large layouts off the main thread              |
| Queue health             | Oldest age, ready/running counts, retries, stale leases and per-user share of capacity         |
| Engine quality           | Achieved depth/nodes, wall time, memory kills, truncated PVs and version distribution          |
| Sync quality             | Provider 429/5xx, cursor coverage, skipped records, duplicate suppression and source lag       |
| Data health              | DB storage/connections/locks, object publication failures, backup age and verified restore age |
| Abuse/cost               | Reserved versus settled CPU, signup/OTP volume, active source count and failed admission       |

Alert on persistent failures and exhausted budgets, not every transient retry. Expose the appropriate state to the user: local analysis available, provider delayed, server analysis queued, partial study, or account action pending. Database failure should leave an already loaded local board usable; it must not pretend that an edit was saved.

Use a small operational dashboard with request/queue/provider/engine metrics and an error tracker. Start with basic structured logging and OpenTelemetry-compatible IDs, keeping exporters replaceable. A production tracing/metrics vendor is not a prerequisite for the domain design, but someone must own alerts and restore drills.

## Capacity and economics

The [saved Tal/control measurements](../research/tal-quick/measurements.json) are local browser evidence, not a cloud benchmark. They covered 262 roots across four games in 128.2 seconds of combined application wall time. Their compressed game/search payloads total 71,635 bytes, roughly 12–25 KB per game. Native throughput, database overhead, graph artifacts and large archives still need measurement.

The important resource formula is:

```text
nominal search hours = games × roots per game × seconds per root × engine threads / 3600
reserved upper bound = nominal hours × fallback allowance + process/layout overhead
```

At an illustrative 81 roots per game and one engine thread:

| Workload                                          | Nominal search time before fallback/overhead | Meaning                                                                 |
| ------------------------------------------------- | -------------------------------------------: | ----------------------------------------------------------------------- |
| 10,000 games × 0.4 s preview                      |                                 90 CPU-hours | Already substantial if done for every import                            |
| 10,000 games × 60 s study ceiling                 |                             13,500 CPU-hours | Upper-bound reservation scenario, not expected time to depth 20         |
| Same study ceiling with a full fallback allowance |                             27,000 CPU-hours | Why the API must reserve by roots/resources rather than by “game count” |
| 100 selected roots × 5 s                          |                              0.139 CPU-hours | Selective enrichment can deliver value at much lower cost               |

These are sizing scenarios using configured limits, not measured CPU utilization or forecasts. Four threads can raise the reservation fourfold without a fourfold quality gain. A worker's nominal monthly capacity is not fully available: imports, pauses, failures, deployments and queue fairness all reduce usable throughput. Measure CPU-seconds and wall-seconds separately.

For public launch, model 1,000 monthly active users and a 100,000-game load-test corpus as an initial test envelope, not a prediction or permanent product ceiling. Include one unusually large 10,000-game owner, mixed time controls, repeated games, missing metadata and concentrated simultaneous imports. Store canonical moves compactly; do not materialize every possible variation or FEN into Postgres. Optional per-ply projections and indexes can dominate storage even when the compressed PGNs are small.

The [EC2 baseline](aws-baseline.md#recurring-budget) models $22–$27/month, with roughly $25 as the working target. The [managed-service budgets](ci-cd-and-costs.md#costs-by-launch-phase) retain earlier alternatives. All are low-traffic planning scenarios before tax and growth, not actual bills.[^render-price][^supabase-pricing]

A second API replica, larger DB compute, PITR, extra engine capacity, object backup egress and email growth can exceed that range. AWS comparison must include RDS, load balancer, networking/NAT or endpoints, IPv4, storage, logging and Auth usage, not only an attractive Fargate CPU rate. Fargate bills CPU/memory allocations and can incur additional networking/log charges.[^fargate]

Keep server analysis disabled until Phase 3. Then begin with one concurrent Fargate task and the proposed 20 billed task-hour monthly envelope in the [worker model](aws-baseline.md#optional-fargate-analysis), subject to measured startup, search and recovery overhead. Per-user CPU limits sit inside that global spending envelope; they are ceilings, not guaranteed capacity for every account. Cache hits and local analysis remain available when new server admission stops.

Before autoscaling, test a spend circuit breaker: the coordinator must stop new reservations when the global budget is reached even if more worker instances are available. Budget alerts alone arrive too late. Scale API replicas on request latency/CPU, import workers within the provider-wide limiter, and engine slots on queue age only within a hard cost ceiling. Increase DB capacity when measured query/IO/storage headroom requires it.

## When to move or split

Keep the monolith until a measured boundary needs independent scaling. Native engine workers are already separate because their resource profile is different. Move queuing to SQS or another dedicated broker if queue churn materially harms user queries or independent failure isolation becomes necessary; retain the domain outbox and idempotency contract.

Stay on the small AWS host while its measured capacity and recovery process meet the beta requirements. Resize it or consider RDS when database memory, maintenance or recovery warrants the extra recurring charge. Add an ALB for a demonstrated multi-instance ingress need, and Redis/Valkey for a measured hot-data bottleneck. Changing a database or auth provider still requires an explicit migration plan; portable SQL does not make session migration automatic.

Use a native graph/canvas renderer for very large visible fields only after measuring the bounded SVG approach. A graph database becomes worth investigating only if real query patterns exceed indexed prefix/adjacency queries; the presence of a graph on screen is not sufficient evidence.

[^supabase-connections]: Supabase, [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres), checked 9 September 2026.

[^render-tf]: Render, [Terraform Provider](https://render.com/docs/terraform-provider), checked 9 September 2026.

[^supabase-tf]: Supabase, [Terraform Provider](https://supabase.com/docs/guides/deployment/terraform), checked 9 September 2026.

[^tf-secrets]: HashiCorp, [Manage sensitive data](https://developer.hashicorp.com/terraform/language/manage-sensitive-data), checked 9 September 2026.

[^tf-s3]: HashiCorp, [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3), checked 9 September 2026.

[^backups]: Supabase, [Database backups](https://supabase.com/docs/guides/platform/backups), checked 9 September 2026.

[^supabase-pricing]: Supabase, [Pricing](https://supabase.com/pricing), checked 9 September 2026.

[^render-price]: Render, [Pricing](https://render.com/pricing) and [Published instance examples](https://render.com/articles/render-vs-railway), checked 9 September 2026.

[^fargate]: AWS, [Fargate pricing](https://aws.amazon.com/fargate/pricing/), checked 9 September 2026.
