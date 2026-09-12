# AWS with a modest monthly baseline

**Accepted planning direction, 9 September 2026: one small EC2 host for the public app, PostgreSQL and imports; browser Stockfish for normal analysis; optional ECS Fargate tasks for selected deeper studies. Target roughly $25/month for the baseline, with a separate allowance for server analysis and learning experiments.**

This replaces the dedicated non-AWS VPS recommendation because learning AWS is part of the project. It also replaces the proposed $85–$100 always-on Fargate/ALB/RDS configuration. The [VPS comparison](vps-first.md) and [managed-service budgets](ci-cd-and-costs.md#costs-by-launch-phase) remain alternatives. This is an architecture decision, not a deployment or permission to create paid resources.

![EC2 baseline and optional Fargate analysis](diagrams/aws-runtime.svg)

## What runs continuously

Use Docker Compose on a dedicated EC2 instance. Caddy serves the React build and forwards `/api` requests to the TypeScript API. Application authentication, a bounded importer/coordinator and PostgreSQL share the host. Keep Graphviz and ordinary Stockfish searches in browser workers. This EC2 host is not an ECS cluster; ECS is introduced for the optional Fargate jobs.

Start the sizing experiment with Linux `t4g.small`: 2 GiB RAM and two burstable ARM vCPUs. Build and test the host images for ARM64. A separately pinned x86 Fargate engine image is valid, but its results must retain their own engine provenance. Two GiB is a candidate to benchmark, not a demonstrated public-app capacity.

Use persistent encrypted EBS for Postgres and private artifacts, outside release directories. The estimate allows 30 GB total across root and data volumes, for example 8 GB root and 22 GB data. Retain the data volume on instance replacement. Back up the database, immutable artifacts, recovery manifests and independent deletion/revocation journal off the host; test a fresh-host restore. Retained EBS alone is not a backup.

The [storage sensitivity](research/platform-investigation.md#hosting-cost-and-the-strongest-alternative) now distinguishes 100,000 imported encounters from a trial 10,000 saved studies and two placed revisions each. At the measured fixture size those pairs alone occupy 8.662 GB; the proposed disk test reserves 8 GB root and at least 6 GB data headroom, leaving at most 16 GB for retained application data. This is a sizing fixture, not proven capacity. The [recovery authority contract](research/platform-investigation.md#recovery-authorities) separates scheduled content backups from revocations made durable before acknowledgment, recovery keys and the independent task registry/reaper. Their selected storage, permissions and costs must be proved before hosted use.

No ALB, NAT gateway, RDS, ElastiCache or permanently running server engine is included. We own patching, auth-library maintenance, database upgrades and recovery. One host is one failure domain; the [public website and recovery requirements](vps-first.md#public-website-security) still apply.

## Recurring budget

These are **US East (N. Virginia), Linux on-demand, 730-hour-month estimates in USD**, checked 9 September 2026. They exclude tax and promotional credits. N. Virginia is the pricing reference, not a selected production region: compare South African latency and regional prices before provisioning.

| Monthly item                          | Calculation or allowance                                       | Monthly USD |
| ------------------------------------- | -------------------------------------------------------------- | ----------: |
| EC2 `t4g.small`                       | $0.0168/hour × 730                                             |      $12.26 |
| gp3 EBS, 30 GB total                  | $0.08/GB-month; included baseline IOPS/throughput              |       $2.40 |
| One public IPv4 address               | $0.005/hour × 730                                              |       $3.65 |
| Route 53                              | One $0.50 zone + 100,000 standard DNS queries at $0.40/million |       $0.54 |
| **Priced subtotal**                   | Unrounded total $18.854                                        |  **$18.85** |
| Encrypted off-host backups            | Planning allowance, based on retained bytes and operations     |       $1–$3 |
| Bounded logs, S3 state/artifact usage | Planning allowance                                             |    $0.50–$2 |
| Domain registration                   | Annual fee amortized; domain not selected                      |       $1–$2 |
| Operating headroom                    | Small incidental usage allowance                               |    $0.50–$1 |
| **Modeled baseline**                  | $21.854–$26.854 before rounding                                | **$22–$27** |

Sources: [EC2 on-demand prices](https://aws.amazon.com/ec2/pricing/on-demand/), [EBS prices](https://aws.amazon.com/ebs/pricing/), [public IPv4 billing](https://aws.amazon.com/vpc/pricing/) and [Route 53 prices](https://aws.amazon.com/route53/pricing/). The EC2 regional pricing table was checked directly for the stated instance; allowances are our estimates, not provider packages. DNS queries are not website request counts.

The roughly $25 target is **not an invoice cap**. This assumes low traffic, bounded data, public GitHub CI and email/monitoring within the [documented free limits](ci-cd-and-costs.md). Extra transfer, paid mail, larger backups, private-repo CI overages and temporary environments need their own allocation. A 4 GiB `t4g.medium` adds $12.264/month in instance charges at the checked $0.0336/hour rate, taking the same model to roughly $34–$39. If the smaller host fails the memory/load test, revise the budget before launch.

Select EC2 **Standard CPU-credit mode** for the first budget experiment and monitor credit exhaustion. This trades sustained burst performance for predictable instance charges; Unlimited mode can add surplus CPU charges. Native analysis belongs on the separately metered workers, not on this small database host. [EC2 Standard mode](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-standard-mode.html)

Both `t4g.small` and `t4g.medium` earn 24 CPU credits per hour: a 20% baseline on each of two vCPUs, or 0.4 vCPU in aggregate. Moving to the medium size buys RAM without increasing that sustained CPU baseline. Test initial startup and sustained load with depleted credits as well as a warm burst balance. [CPU credit table](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html)

## Optional Fargate analysis

Server studies remain Phase 3. Use an ECS standalone task that completes bounded work and exits. There is no always-on Fargate service waiting for a queue. The existing coordinator on EC2 dispatches admitted jobs, records the task ARN and reconciles their completion. Cache lookup happens before any compute reservation or task launch. [ECS standalone tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/standalone-tasks.html)

For a Linux x86 task with **1 vCPU and 2 GB RAM**, the checked rates give:

```text
task compute/hour = $0.04048 + 2 × $0.004445 = $0.04937
with public IPv4 = $0.04937 + $0.005 = $0.05437/hour
20 billed task-hours = $1.0874, approximately $1.09
```

This is task compute and IP only. Fargate bills allocated resources, including applicable image-download/startup time and a one-minute minimum for Linux; it does not bill only productive engine CPU seconds. Storage, logs, image pulls and other transfer are additional where applicable. The included 20 GB task storage is temporary workspace, not the result archive. [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [IPv4 pricing](https://aws.amazon.com/vpc/pricing/)

The formula uses the [current hourly price-feed meters](research/evidence/economics/aws-price-feed-records.json). AWS's per-second prose example rounds slightly differently; the distinction does not change the rounded $1.09 estimate. The [worker sensitivity model](research/evidence/worker-economics.json) shows how task minimums, batching, compatible reuse and retries affect billed hours; it supplies no measured game-count or depth guarantee.

Start with one concurrent task and a **proposed 20 billed task-hour monthly envelope** when server studies are enabled. Reserve dollars from allocated vCPU, RAM, networking and maximum wall duration in addition to the domain CPU budget. Charge retries and startup against that allowance. A cache hit or browser search consumes no server-engine allocation. Twenty task-hours is a spending scenario, not a game count or a promised depth.

Use an idempotent launch token per attempt, reconcile uncertain launches before retrying, and keep generation-fenced result publication in Postgres. An in-task wall deadline must stop the engine and exit. A separate scheduled reaper must stop overdue/orphaned tasks even if the EC2 coordinator fails; its implementation and small operating cost belong in the Phase 3 estimate. Stop admitting jobs when reservations exhaust the envelope. AWS budget alerts are a secondary notification, not enforcement. Prove these controls before public server-study access. [RunTask idempotency](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RunTask.html)

Workers receive only their assigned input and result grants through the API broker. They get no database, user-session or chess-provider credentials. Publish the durable result before task exit; after a worker crash, retries recover through the existing [job and settlement contract](data-and-analysis.md#jobs-retries-and-budgets).

## Networking and public access

Route 53 resolves the chosen domain to the host's stable public address; it is not a proxy in the HTTP path. A VPC public subnet reaches the internet through an internet gateway. The EC2 security group permits HTTPS and the HTTP path needed for redirect/certificate setup. PostgreSQL and container management ports are not published.

Use Systems Manager for administration and a constrained deployment command, with the required agent, IAM role and outbound connectivity verified. No public SSH listener is required for that route. Separate infrastructure, deployment, host and optional worker identities; an engine container must not inherit the coordinator's ECS-launch permission. [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)

The optional Fargate task uses a public subnet and temporary public IPv4 for outbound HTTPS, with **no inbound security-group rules**. This avoids the NAT gateway's fixed charge in the proposed topology. It connects to the authenticated broker and storage APIs; it does not open a public analysis endpoint. Verify image registry, logging, grant and broker connectivity in the actual task. [Fargate networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html)

Apply the existing [public-input, account isolation and rate-limit requirements](vps-first.md#public-website-security). AWS Shield Standard supplies baseline DDoS protection at no extra charge; it does not establish application abuse controls or guarantee availability of this single host. [Shield pricing](https://aws.amazon.com/shield/pricing/)

The diagram and cost table above describe a direct-host origin. The [current investigation](research/platform-investigation.md#cloudfront-candidate-and-its-conditions) adds CloudFront's $0 flat-rate plan as a candidate edge: it may include the needed CDN/WAF and attached DNS charges, subject to account eligibility and policy limits. It requires a different request path, restricted origin ingress, uncached private API behavior and tested certificate renewal. Do not add the old pay-as-you-go WAF estimate to an eligible bundle, or assume this candidate has been configured. ALB and higher availability remain separate design costs. [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)

## Cache the work and its presentation separately

The current demo caches exact position searches in browser IndexedDB, but rebuilds the graph when reopening a game and forces refreshes for branch exploration. Hosted persistence should make those stages visible and independently reusable.

1. **Retained analysis:** save immutable candidate moves, scores, actual depth and engine/search manifests in Postgres, moving larger payloads to private S3 objects when useful. Scope private entries by owner and execution trust; curated public studies may have a separate shared namespace.
2. **Retained diagram:** save the semantic graph and layout, keyed by result IDs and the diagram-policy/Graphviz versions, including any pinned expansion state that affects placement. A paper-rule or layout change rebuilds this layer without running Stockfish.
3. **Optional hot cache:** add Redis/Valkey only after measuring a storage-read or coordination bottleneck. Keep the authoritative results and job state durable outside that cache.

Concurrent matching requests should attach to one active computation. Full search identity, partial-depth handling, deletion and shared-job cancellation are specified in [persistent analysis and diagram reuse](data-and-analysis.md#persistent-analysis-and-diagram-reuse). A diagram render and a fresh engine search need different progress states in the UI.

ElastiCache Serverless for Valkey has a 100 MB minimum storage meter. At N. Virginia's $0.084/GB-hour rate, that is about $6/month before request processing and applicable extras. It is excluded from the baseline. A normal indexed lookup of retained results already avoids repeating Stockfish work. [ElastiCache pricing](https://aws.amazon.com/elasticache/pricing/)

## Delivery and learning sequence

GitHub-hosted runners verify PRs with disposable data. A trusted release builds immutable ARM64 host and, later, x86 worker images, verifies those artifacts in isolated staging and promotes their digests. AWS access uses GitHub OIDC with an exact trusted repository/environment subject and audience; match this repository's actual claim format. Keep the existing [production promotion and rollback controls](ci-cd-and-costs.md#delivery-pipeline). [GitHub OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)

Terraform owns AWS resources, network/IAM boundaries, DNS and optional worker definitions. Compose and the release workflow own application rollout; SQL migrations own database schema. Use a restricted encrypted/versioned S3 state backend with locking, separate from application backup objects. [Terraform ownership](infrastructure-and-delivery.md#terraform-ownership)

| Learning step             | Build and understand                                                       | Evidence before moving on                                                                       |
| ------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Host and packet path      | EC2, EBS, VPC, subnet, route table, internet gateway and security groups   | Diagram one HTTPS request; prove private ports are unreachable; rebuild the host                |
| Name and identity         | Domain delegation, Route 53 records, TLS, IAM and application sessions     | Explain DNS versus routing; verify certificate renewal and least-privilege administration       |
| Release and recovery      | OIDC, Terraform state, image digests, migrations and backups               | Promote and roll back one tested release; restore into an empty isolated host                   |
| Optional computation      | ECS task definitions, Fargate networking, grants, caching and reservations | Cache hit launches no task; failed/duplicate launch settles once; orphan reaper works           |
| Temporary networking labs | ALB, private subnets/NAT, API Gateway/Lambda and WAF                       | Price each lab, trace its changed request path, tear down and check retained billable resources |

Use Torry's documentation pattern as we implement: each concept gets a diagram, the actual selected configuration, verification commands and failure examples; guides and operational runbooks stay separate. The table is a learning roadmap, not completed tutorials. Lab costs are separate from the $25 baseline. A Fargate/ALB/RDS lab can be short lived; retained disks, snapshots, addresses, hosted zones and log storage still need explicit cleanup checks.
