# Validation and decision record

This document distinguishes **a completed architecture proposal** from **a verified implementation**. The platform described here has not been provisioned. The existing app's tests cannot establish cloud authorization, job safety or recovery behaviour; the gates below must be implemented and exercised before their corresponding release phase.

## Requirement coverage

| Requirement                           | Concrete design evidence                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public-facing security                | [AWS networking](aws-baseline.md#networking-and-public-access) and [public website requirements](vps-first.md#public-website-security); HTTPS, service isolation and abuse limits          |
| Public application anyone can join    | [Product boundary and phases](README.md#the-product-boundary); private defaults, signup/SMTP controls and admission limits                                                                 |
| Frontend                              | [Frontend and navigation](README.md#frontend-and-navigation); route map, state boundaries, guest mode, workers and accessible lifetime navigation                                          |
| Backend                               | [Backend structure](README.md#backend-structure); modular TypeScript service, explicit contracts and separate worker processes                                                             |
| Database                              | [Relational model](data-and-analysis.md#relational-model); keys, tenant ownership, encounter/content distinction and indexes                                                               |
| Authentication                        | [Application sign-in](identity-and-access.md#application-sign-in); application auth on local Postgres; session lifecycle, recovery and revocation                                          |
| Authorization                         | [Authorization matrix](identity-and-access.md#authorization-matrix); object access, RLS runtime roles, worker scopes and share grants                                                      |
| Users and profiles                    | [Users, profiles and ownership](identity-and-access.md#users-profiles-and-ownership); stable identity, handles, privacy, verified ownership and moderation                                 |
| Lichess linking                       | [Connection flow](identity-and-access.md#lichess-connection-flow); actual PKCE and account/token contracts                                                                                 |
| Chess.com linking                     | [Public sources](identity-and-access.md#chesscom-public-sources); useful imports with honest verification status and approved-auth dependency                                              |
| Terraform                             | [Terraform ownership](infrastructure-and-delivery.md#terraform-ownership); modules, environments, state, providers, secrets and deployment ownership                                       |
| Hosting comparison and recommendation | [Stack choice](README.md#stack-choice); accepted EC2 baseline, optional Fargate and retained alternatives                                                                                  |
| Durable imports                       | [Durable imports](data-and-analysis.md#durable-imports); streaming, provider limiter, checkpoints, replay and deduplication                                                                |
| Analysis and friend's compute server  | [Immutable computation](data-and-analysis.md#analysis-as-an-immutable-computation) and [jobs](data-and-analysis.md#jobs-retries-and-budgets); CPU provenance, isolation, grants and quotas |
| Lifetime maps and insights            | [Lifetime graph construction](data-and-analysis.md#lifetime-graph-construction); played-prefix aggregation, perspectives, counts, chunks and uncertainty                                   |
| Operations and economics              | [Infrastructure](infrastructure-and-delivery.md); rollout, rollback, backup/restore, alerts and formula-based capacity                                                                     |

## Decisions to adopt for implementation

The follow-up [CI/CD and cost model](ci-cd-and-costs.md) adds build-once promotion, privileged Terraform plan/apply, current private-repo plan constraints and itemized budget scenarios. After cost research and the decision to learn AWS, the [EC2 baseline](aws-baseline.md) is the accepted direction: roughly $25/month for hosting, with optional Fargate studies and temporary labs separately budgeted. The earlier generic-VPS and managed-service allocations remain alternatives. [Repository strategy](repository-strategy.md) separates public-app access, repository privacy and GPL distribution obligations. Neither document changes visibility or enables deployment.

| ID  | Proposed decision                                                  | Reason / consequence                                                                   |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| D01 | Public signup; libraries and profiles private by default           | Public availability is not public disclosure                                           |
| D02 | Retain React/Vite and browser WASM analysis                        | Preserves responsive, useful local interaction and reduces server cost                 |
| D03 | One TypeScript API; separate import and CPU workers                | Simple contracts with resource isolation where it matters                              |
| D04 | EC2 + Compose: Postgres, application auth and private files        | Learns AWS with a roughly $25 baseline; validate ARM images, sizing, auth and recovery |
| D05 | Application API is the private-data boundary                       | One place for budgets and object-level authorization; RLS backs it up                  |
| D06 | App identity, verified connection and studied subject are separate | Prevents impersonation and mistaken statistics                                         |
| D07 | Chess.com PubAPI source is not an ownership proof                  | Verified Chess.com connection waits for official access                                |
| D08 | Distinct game encounters can share move content                    | Avoids losing legitimate repeated games while allowing blob deduplication              |
| D09 | Search results and graph revisions are immutable                   | Enables stable replay, audit and controlled renderer comparisons                       |
| D10 | No cross-user private analysis cache initially                     | Avoids private-query presence leaks and provenance confusion                           |
| D11 | Build archive topology before optional engine enrichment           | Makes lifetime exploration useful without analyzing every root                         |
| D12 | Reserve compute by bounded targets/resources                       | Prevents a cheap HTTP request from creating an unbounded bill                          |
| D13 | Terraform for resources; SQL migrations for database semantics     | Avoids overlapping infrastructure/schema ownership                                     |
| D14 | No Kubernetes, graph DB, Redis or WebSocket service initially      | Durable analysis reuse works without a separate hot-cache service                      |
| D15 | Optional standalone ECS Fargate tasks, no always-on engine service | Cache lookup before launch; bounded task duration, cost reservation and orphan reaping |
| D16 | Persist analysis, semantic graph and placed diagram separately     | Reopen saved work and revise drawing rules without repeating Stockfish                 |

## Phase 0: feasibility before the first platform implementation

The first engineering work should be four narrow vertical slices, each proving a material boundary. These are experiments to run in isolated staging; no production credentials or deployment are implied by this document.

1. **Identity slice.** Google sign-in and verified email recovery through the selected application auth library; two browsers; concurrent session requests; local/global logout; external revocation; suspension; callback replay; recovery. Verify tokens never enter frontend storage, shared caches or logs. Confirm the selected library's session controls and SMTP configuration.
2. **Data isolation slice.** Two users, one public source, separate private notes and downloads. Use the real restricted database roles through the actual connection pool. Attempt cross-owner parent/child insertion and a leaked artifact ID. Verify RLS context disappears after commit, abort and connection reuse.
3. **Import slice.** A completed Lichess game and a Chess.com archive fixture, plus controlled live smoke requests. Exercise rate limits, interruption and overlapping windows. Complete Lichess OAuth with a real test account only when the account owner authorizes it; a mocked response is not proof of the provider handshake. Chess.com authenticated access remains a separate external dependency.
4. **Infrastructure slice.** Rebuild an empty EC2 host from Terraform/bootstrap and the Compose definition. Verify ARM64 images, security groups, scoped Systems Manager access, DNS and HTTPS. Test API/import memory under concurrent use, local Postgres roles and pooling, an image promotion/rollback, and an off-server backup restore. Prove any Terraform provider coverage actually needed. Move the native Stockfish adapter, binary/NNUE manifest and kill/reclaim experiments to Phase 3; server analysis is not a public-library launch dependency.

The native engine need not match browser-lite evaluations or geometry exactly. It must produce legal histories, honest same-depth candidate comparisons, the same mark semantics and explicitly different provenance. Freeze its results before layout comparison. Test the version actually selected; current online UCI examples can describe a later engine than the repository's pinned Stockfish 18 package.

## Failure and security scenarios

| Scenario                                                                    | Required behaviour / evidence                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A knows B's game, note, job or artifact ID                                  | Every private endpoint and storage route denies it without disclosing existence                    |
| A inserts a child referencing B's parent                                    | Composite FK and RLS reject it through the actual API database role                                |
| A attempts two simultaneous verified links to the same account              | One commits; the other receives a conflict; neither token leaks                                    |
| An OAuth callback is replayed or bound to another session                   | State, expiry and session binding reject it; no connection changes                                 |
| Two tabs refresh together                                                   | One current session state survives; no accidental token reuse logout or mixed user                 |
| User unlinks while import is running                                        | No new fetch begins; current work cannot publish after the source's cancellation generation        |
| Provider returns 429 or a partial NDJSON stream                             | Delayed retry and incomplete coverage are visible; no records skipped by cursor advancement        |
| Two games share a timestamp                                                 | Resuming a window imports both exactly once                                                        |
| Two distinct games share moves and result                                   | Two encounters remain; content may be shared                                                       |
| Same provider game is imported from both players' sources                   | One encounter in that owner's library; multiple source references                                  |
| Provider corrects metadata or moves                                         | New immutable revision; old contribution removed and new one added once                            |
| Matching requests arrive concurrently                                       | One active computation/reservation; shared cancellation does not invalidate another request        |
| Diagram policy changes with saved analysis                                  | Rebuild derived graph/layout without launching Stockfish                                           |
| Saved depth-20 request only achieved depth 13                               | Show partial coverage; never relabel as depth-20 analysis                                          |
| Optional hot cache is cleared                                               | Durable analysis and diagram revisions remain readable                                             |
| Coordinator fails after uncertain Fargate launch                            | Reconcile task identity before retry; independent reaper bounds orphan runtime                     |
| Same board appears with different history/clocks                            | Display sharing does not share a history-sensitive search result                                   |
| Worker dies before/after upload, commit or acknowledgement                  | Retry may execute, but one active result is published and settlement is idempotent                 |
| Lease expires and the old worker returns                                    | Fencing generation rejects its publication                                                         |
| User cancels or deletes account during analysis                             | Child stops; stale result cannot attach to the cancelled/deleted request                           |
| Client requests huge threads/depth/hash values                              | Preset validation and transactional reservation reject the request                                 |
| Queue is flooded by one user                                                | Per-user fairness and global admission preserve capacity for others                                |
| Global spend budget is exhausted                                            | New server reservations stop; local analysis and existing library reads continue                   |
| A failed attempt consumed the remaining budget                              | New execution cannot reuse the spent reservation; retry waits or is refused                        |
| Uploaded engine result contains invented scores                             | It remains device-generated; cannot enter trusted server cache/insights                            |
| External worker lies about its engine or evaluation                         | Result stays in the external trust tier; authenticated transport does not promote it               |
| Malformed PGN, nested comments, oversized archive, redirect to private host | Parser/fetch caps terminate safely without hanging API or turning into SSRF                        |
| Shared link revoked while a visitor has it                                  | New share requests fail; owner signed-download expiry is bounded and documented                    |
| Account is deleted, then backup restored                                    | Deletion tombstones are reapplied before public traffic                                            |
| Session, connection or share was revoked after a backup                     | Restored sessions are invalidated; independent revocation journal is applied before access or sync |
| Database restores but objects or key ring do not                            | Restore gate fails; no declaration of successful recovery                                          |
| New engine/renderer releases while replay is active                         | Active replay stays on its pinned revision; a new result is offered explicitly                     |

These tests should exercise real Postgres and the selected filesystem/object-storage adapter, not only mocks of repository methods. Provider HTTP can be recorded/mocked for deterministic failure injection; live smoke tests remain separate and rate-limited. Fixtures must be redacted and contain no session/connection secrets.

## Scale and diagram gates

Use a staged synthetic corpus of 1,000, 10,000 and 100,000 game encounters, including a large single-user archive. It must contain repeated opening prefixes, transpositions, identical move sequences from distinct encounters, private uploads, custom initial positions, missing metadata, mixed ratings pools, self-play and provider corrections. Synthetic load data is explicitly labelled; it is not evidence of real playing patterns.

Check aggregate counts against an independent straightforward replay of the corpus. Add an encounter, replay the event, correct it, delete it, restore a snapshot and compare again. “Import completed” is not enough; verify coverage, encounter count, contributions and the selected perspective.

Measure API latency, SQL plans, connection headroom, DB/index growth, job throughput and browser memory. At 390px and a wide desktop viewport, verify keyboard navigation, graph/board synchronization, small-node selection, collapsed counts and stable coordinates during replay. Large invisible branches must not create thousands of live DOM elements.

For regression, use the existing Tal and Deep Blue frozen inputs and the independent `/paper` reference. A platform migration must preserve legal histories and rendering rules, even when a new engine deliberately generates different candidates. A screenshot count or “tests green” is not a substitute for checking event fills, mate endpoints, shared occurrence selection and quiet-path unfolding.

## Release gates

**Phase 1 public library:** the VPS public-website security checks, reviewed schema/authorization migrations, signup/recovery, verified Lichess connection, correctly labelled Chess.com source, bounded/resumable imports, profile defaults, per-owner quotas, export/deletion, combined backup restore, rate limits and operational ownership. Local analysis can launch before paid server analysis exists.

**Phase 2 lifetime view:** exact selected-cohort counts, complete/incomplete coverage display, safe duplicate handling, revision invalidation, bounded graph chunks and accessible navigation. Demonstrate a 10,000-game account without an all-game engine run.

**Phase 3 server studies:** resource manifests, standalone Fargate startup/exit, legal same-depth semantics, concurrent cache-miss deduplication, cancellation/lease tests, billable-wall-time reservations, independent orphan reaping, fairness and results preserved across browser closure. Prove cache hits launch no task, diagram changes preserve analysis, and record measured cost per selected study preset. The proposed 20 billed task-hour monthly envelope is not capacity already enabled.

**Phase 4 sharing/insights:** revocation, redaction, publication defaults, untrusted annotation handling, minimum samples and explicit analysis coverage. An outcome percentage must identify its denominator; no causal coaching claim comes solely from a correlated opening result.

## Remaining decisions and bounded unknowns

| Item                                        | Default / next action                                                                    | Does it block the design?                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Launch domain and operating entity          | Choose before email/OAuth/production provisioning                                        | No; exact URLs are configuration                                                                  |
| AWS region and privacy jurisdiction         | Compare regional costs/latency; test EC2 memory and CPU credits; settle privacy terms    | No; provisioning is gated                                                                         |
| Public beta recovery target                 | Proposed RPO 24h / RTO 8h; purchase stronger recovery if needed                          | No; must be explicitly accepted before a reliability promise                                      |
| Server-compute allowance                    | Start conservative; calibrate from native measurements and a monthly spend cap           | No; no unlimited-compute promise                                                                  |
| Native engine size and throughput           | Phase 3 benchmark; engine/NNUE version pinned separately from browser lite               | No; no throughput claim is assumed                                                                |
| Application auth/session integration        | Phase 0 concurrency and revocation proof                                                 | No; it is a required implementation gate, with a different supported auth integration if it fails |
| Terraform field coverage / secret behaviour | Inventory selected provider schemas; record manual/API bootstrap and drift ownership     | No; no untested HCL is presented as deployable                                                    |
| Chess.com authenticated integration         | Official application/approval and contract verification before enabling verified linking | Blocks that capability only; public archives remain usable                                        |
| SMTP/monitoring/backup vendors              | Select within the budget; verify mail, access and recovery before launch                 | No; capability and boundary are specified                                                         |
| Subscription/payments                       | Defer pricing until measured usage; retain entitlements and usage ledger                 | No; public free registration is supported by caps                                                 |

## Design verification record

The proposal is grounded in current application modules, the saved four-game measurement data, the personal-brain history/provenance learning, and the official source register. Diagrams are generated from checked-in DOT with the repository's Viz.js dependency.

The earlier document validation on 9 September 2026 checked eight design documents, 57 local links including 19 heading anchors, and 64 source-footnote references without missing targets. The four diagrams render without Graphviz warnings and were visually inspected in Chromium. The generator passes ESLint; the design documents and generator pass Prettier. Capacity arithmetic was recalculated from the four saved runs: 262 roots, 128.184 seconds combined elapsed time, and 71,635 compressed bytes. The numerical scenarios are calculations, not cloud benchmarks.

The CI/CD follow-up also recalculated the monthly allocations, Actions usage/overage scenarios and the uncompressed WASM transfer example. The earlier managed-service lean allocation totals $49; the fuller options total $102, $147 and $172. The lean service sizes and temporary-staging allowance require memory/load and actual-billing checks before adoption. The follow-up checked actual GitHub visibility and latest successful job metadata without changing repository settings. Cloud pipeline behavior remains a proposed implementation gate.

No backend, auth provider, database, Terraform resources, connected account or paid service was created for this design. Implementation feasibility and launch gates above remain explicitly unexecuted. The design can be reviewed and adopted without mistaking a plan for a running platform.

The dedicated-VPS revision inspected Torry's provisioning guide, Compose service reference, deployment workflow and runner decision; it did not inspect live server capacity or billing. Current official documentation confirmed the listed $5 Servarica tier is out of stock, PostgreSQL support in the candidate auth library, Caddy HTTPS automation and Docker firewall behaviour. The modeled VPS allocation sums to $7–$15, with $10–$15 as the working target. Validation checked nine documents, 69 local links, 21 heading anchors and 64 source-footnote references. The public-facing security checks are proposed launch gates, not tests already passed by a hosted implementation.

The accepted AWS revision on 9 September 2026 separates the $22–$27 recurring EC2 model from optional Fargate usage and learning labs. It adds persistent analysis/diagram reuse, exact-match job sharing and a staged networking-learning roadmap. Rates were checked against the official sources linked in the AWS baseline; the approximately $1.09 example covers 20 billed task-hours of compute and public IPv4 only. No paid resources were created, and no cloud feasibility or runtime cache tests were performed by updating the documentation.

The pre-investigation revision passed document-format, local-link, footnote, diagram-generation and generator-lint checks. Its $18.854 priced subtotal and $21.854–$26.854 baseline remain the selected direct-host arithmetic. The adversarial investigation corrected the optional 20-task-hour amount to **$1.0874** using retained hourly feed meters and added per-second ceiling tests. Historical link counts describe that earlier document set, not later edits. The [current investigation](research/platform-investigation.md) records the new executable probes and later review verdict; none establishes a deployed platform.
