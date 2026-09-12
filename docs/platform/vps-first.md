# Dedicated VPS comparison and shared operating requirements

**Alternative, 9 September 2026:** the accepted direction is now the [AWS EC2 baseline](aws-baseline.md), targeting roughly $25/month with optional Fargate analysis charged separately. This document preserves the cheaper generic-VPS and Lightsail comparisons plus the public-security, deployment and recovery requirements that still apply to the EC2 host.

Torry is the deployment precedent; Enpassant gets its own machine. The earlier $10–$15 generic-VPS target and $49 Render/Supabase design remain alternatives. AWS was selected as the planning direction to learn its networking and infrastructure concepts.

## Evidence and budget

Torry's repository records a Servarica Chimera Hybrid 1 with 4 GB RAM, two shared CPUs, 65 GB NVMe and 2 TB HDD, at $5/month. Its Compose stack, deployment workflow and provisioning guide demonstrate an existing operating approach. This was a repository inspection, not a live capacity or billing check. No Torry configuration or credentials were changed.

Servarica's current [Chimera listing](https://servarica.com/plan/633/) confirms the $5/month price and specifications, but marks the plan **out of stock**. A fresh server at that price is therefore not presently assured. Use an available comparable plan and its actual renewal price when selecting the machine.

| Monthly item                                                                        | Planning allowance |
| ----------------------------------------------------------------------------------- | -----------------: |
| Dedicated VPS                                                                       |             $5–$10 |
| Encrypted off-server backups                                                        |              $1–$3 |
| Domain, annual fee amortized                                                        |              $1–$2 |
| Public GitHub CI, container registry, basic monitoring and email within free limits |                 $0 |
| **Modeled range**                                                                   |         **$7–$15** |

**For this non-AWS alternative, use $10–$15 as the working target**, before tax, growth and operator time. Backup and domain rows are allowances, not vendor quotes; the free CI/registry/email limits remain those checked in the [cost comparison](ci-cd-and-costs.md). No Proton VPN subscription is needed for Enpassant's normal public HTTPS service. This is a hosting hypothesis, not a measured user-capacity claim.

## AWS at a similar budget

**AWS Lightsail is a valid host for this same single-VPS design.** The earlier AWS comparison emphasized ECS/RDS and omitted this simpler option. Lightsail can approach the target monthly spend, with less hardware than Torry's Servarica plan.

| Linux instance with public IPv4 | Instance/month | With $1–$3 backup and $1–$2 domain allowances |
| ------------------------------- | -------------: | --------------------------------------------: |
| 1 GB RAM, 40 GB SSD             |             $7 |                                        $9–$12 |
| 2 GB RAM, 60 GB SSD             |            $12 |                                       $14–$17 |
| 4 GB RAM, 80 GB SSD             |            $24 |                                       $26–$29 |

AWS includes compute, disk, public IPv4 and a transfer allowance in these bundles; transfer allowances vary by region. These are ongoing list prices, excluding promotional credits and tax. [AWS instance bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)

The **2 GB plan is the Lightsail candidate to benchmark** for Caddy, API, Postgres and a bounded importer, with browser Stockfish. The 1 GB plan has tighter memory headroom. The 4 GB option matches Torry's RAM but does not match its $5 price or storage. We still own application security, patching and recovery on Lightsail.

Backup figures are planning allowances, not included instance features. Lightsail snapshots cost $0.05/GB-month of retained snapshot storage; their total depends on retained data and changes. Keep the consistent database/artifact recovery process below and measure its storage. Temporary test environments and overages are additional if incurred. [AWS snapshot billing](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-snapshots.html)

## What runs where

| Component                                                 | Initial placement                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| React, Graphviz and Stockfish interaction                 | Browser; static files served by Caddy                                     |
| Public HTTPS and `/api` routing                           | Caddy on the VPS                                                          |
| TypeScript API and sign-in/session handling               | One application container                                                 |
| Imports and scheduled work                                | One bounded worker using the same application image                       |
| Users, sessions, games, annotations and durable job queue | PostgreSQL container with persistent NVMe storage                         |
| Raw PGNs and immutable artifacts                          | Private persistent filesystem volume, accessed through the authorized API |
| Backups                                                   | Scheduled job copying encrypted database/artifact backups off the VPS     |

Separate processes and permissions do not require separate servers or subscriptions. Set memory limits, connection limits and import concurrency, with host headroom. Start with one import at a time. Measure concurrent login, archive import and library reads on the selected machine before setting beta limits. Build images in CI rather than spending production RAM compiling them.

The database has no public port; only the HTTPS ingress is public, with HTTP used for redirect/certificate setup as configured. Administration uses restricted SSH or a private management network. Artifact identifiers are server-generated, immutable and resolved through ownership checks; the static file server cannot expose the private volume. Keep ownership constraints and restricted transaction-scoped database roles from the [data design](data-and-analysis.md).

Use an established authentication library in the application instead of deploying the full Supabase stack. **Better Auth is the candidate to validate**: its official [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql) supports a direct Postgres connection. Use its supported session mechanism, secure HttpOnly cookies and reviewed migrations. Do not duplicate it with the earlier custom Supabase refresh-token bridge. Prove Google sign-in, verified email recovery, CSRF protection, logout/revocation, suspension and cross-user isolation before launch. Account linking and chess-provider ownership rules remain unchanged. Email still needs a verified sender and bounded delivery.

Server Stockfish is deferred until Phase 3. Played-game lifetime diagrams and browser analysis remain useful without it. The accepted AWS path uses [bounded standalone Fargate tasks](aws-baseline.md#optional-fargate-analysis) for selected background studies, leaving the small API/database host available for the public app.

## Public website security

`enpassant.co.za` is the user's example launch domain, not a checked or registered domain. Public visitors reach the website normally; they do not join a Tailscale network. Administrative access remains separate. Torry's private-network access model cannot substitute for Enpassant's application login and authorization.

| Boundary                            | Launch requirement                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internet to website                 | Configure the owned hostname in Caddy, automated certificate renewal and HTTP-to-HTTPS redirects. Publish only the intended ingress ports. Set explicit allowed hosts and origins.                                                                                                                                    |
| Website to private services         | Keep Postgres, worker, Caddy admin API and monitoring dashboards unpublished. Give app/worker containers only required volumes and credentials; no Docker socket, privileged mode or unnecessary host mounts.                                                                                                         |
| Visitor to account                  | Supported auth library, secure HttpOnly sessions, CSRF protection, verified recovery and revocation. Generic auth errors and bounded login/signup/email attempts. MFA for operational accounts.                                                                                                                       |
| One user to another user's data     | Server-side ownership checks on every library, job, artifact, export and share request; restricted DB roles and owner constraints. Default libraries/profiles to private. Test by substituting another user's IDs.                                                                                                    |
| Public input to parser and renderer | Cap request bytes, game counts, decompression, parse time and graph size. Treat PGN tags, comments and imported annotations as untrusted text. Escape DOT/HTML labels and validate generated SVG before DOM insertion; test hostile tags, links and markup. Use a tested CSP compatible with the actual WASM workers. |
| Imported link to outbound request   | Parse supported chess links and construct provider API URLs server-side. Reject arbitrary destinations, private-address targets and unsafe redirects. Cap fetch time/bytes; never forward app cookies or provider tokens to a new origin.                                                                             |
| Public demand to finite resources   | Enforce per-account and per-IP admission limits plus a global import queue bound and per-user storage quotas. Trust forwarded IP headers only from the configured proxy. Prevent signup or repeated imports from exhausting email, disk or memory.                                                                    |
| Deployment and recovery             | Hosted CI for untrusted PRs, trusted release promotion, secrets outside images/git/logs, tested off-server restore and an external availability check.                                                                                                                                                                |

Caddy documents automatic certificates and renewal for correctly configured public DNS names. Docker warns that published container traffic can bypass normal UFW processing: inspect actual port bindings and test reachability from outside the host rather than relying on a firewall status message. [Caddy HTTPS](https://caddyserver.com/docs/automatic-https), [Docker firewall behaviour](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

An upstream CDN or protective proxy can be added if traffic or abuse warrants it. Its caching must exclude authenticated responses, and origin access plus trusted proxy headers need deliberate configuration. A single directly exposed VPS and application rate limits do not promise resistance to a large volumetric attack. Price any required upstream protection before promising that availability level.

Before opening registration, prove HTTPS renewal, external port isolation, cross-account access denial, logout/recovery, malicious-import handling, queue saturation and backup restoration. These are implementation checks still to run; writing this design does not establish that the application is secure. Public exposure adds engineering and ongoing care, without automatically adding a managed-service subscription.

## CI/CD without another hosting platform

1. Keep GitHub-hosted PR verification. Run the API, Postgres and worker against synthetic data in a disposable Compose environment, alongside the existing browser checks. PR code receives no production secrets.
2. After trusted `main` passes, build once and publish an immutable image digest. Test that exact image with disposable data, including migrations. Use a temporary isolated HTTPS test environment for real OAuth callbacks when needed; temporary infrastructure costs must fit the allowance or be separately priced.
3. An authorized production workflow promotes that verified digest through a constrained server-side deployment entry point. The AWS baseline uses a scoped Systems Manager command; another VPS may use restricted SSH with a pinned host key. Serialize deploys, constrain the repository/digest input, and keep credentials out of PR jobs.
4. Run compatible SQL migrations, update Compose, verify readiness and a library smoke check, and retain the previous image digest. Stop promotion on failure. Roll back the application only when the database schema remains compatible; take a recovery backup before a migration that needs it.

Torry's private, single-maintainer deployment uses a runner on the production box. **Do not copy that runner placement into Enpassant's public repo**: GitHub documents the persistent-host risk from untrusted workflow code. Keep CI execution on hosted runners. Repository privacy is a separate choice and is not necessary for VPS deployment. [GitHub security guidance](https://docs.github.com/en/actions/reference/security/secure-use)

Commit the Compose definition, provisioning steps and deployment scripts. Use cloud-init or an idempotent host-setup script. The [AWS Terraform ownership](infrastructure-and-delivery.md#terraform-ownership) covers the accepted EC2 path; another VPS provider needs its own verified provisioning adapter.

Keep persistent database/artifact volumes outside release directories and code-sync targets. Torry's deploy workflow records a previous `rsync --delete` mistake affecting runtime state; an immutable application release must never replace or delete Enpassant's data volumes. Deployment must also avoid `docker compose down --volumes` and blanket volume pruning.

## Operations we still own

We take responsibility for OS/container updates, disk capacity, Postgres upgrades, auth-library patches and recovery. One VPS is one failure domain; scheduled maintenance and host failures can interrupt the whole app. There is no high-availability promise.

Keep daily consistent database backups plus immutable artifact copies and a manifest outside the machine. A second disk on the same VPS is not that backup. Retain the independent deletion/revocation journal and key recovery process; invalidate sessions and apply tombstones before reopening a restored service. Test restoring into an empty machine. The existing proposed **24-hour data-loss window and eight-hour recovery target** remain targets to prove, not an SLA. If these are unacceptable, revise the backup schedule and cost before making a reliability commitment.

Check backup freshness, free disk, memory, failed imports and errors. At least one external uptime check must survive loss of the VPS. Scale when measured memory, CPU, latency, disk or queue delay justify it: resize the VPS, then separate heavy analysis, and consider managed Postgres when the operating burden or recovery requirement makes it worthwhile.

This revision changes the proposed deployment foundation. It does not provision a VPS or implement the account backend.
