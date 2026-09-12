# Identity and access

Enpassant needs three different identities: **the person signed into Enpassant**, **a chess-site account**, and **the player perspective used to study a game**. Treating all three as a username would permit impersonation, duplicate libraries and misleading lifetime statistics.

## Users, profiles and ownership

`app_user.id` is an internal UUID that remains stable across email changes, renamed handles and provider changes. `auth_identity` maps a trusted issuer and subject to that user. An email is a contact and recovery attribute, not a cross-provider primary key. Do not merge accounts because two unverified payloads contain the same email.

`profile` contains a unique case-normalized Enpassant handle, display name, optional biography and selected public links. Its visibility defaults to private. Reserved handles, length limits, moderation and rename history prevent impersonation of administrative routes. Avatars should initially be generated initials; later uploads must be size-limited and decoded/re-encoded. Do not render arbitrary remote SVGs or trust provider-supplied markup.

Each person owns a library. A game may be publicly available at its source while their notes, filters, selected opponent, archive and analysis requests remain private. The initial product has no organizations or team-role hierarchy. A future shared study gets explicit membership rows rather than overloading the owner field.

The same external account can be watched by many users as a public source. Only a verified connection can establish that an account is controlled by a particular Enpassant user. Enforce at most one active verified owner per provider account, transactionally. Support several verified accounts belonging to one user; cap their number through entitlements rather than a schema assumption.

## Application sign-in

For the current [AWS EC2 baseline](aws-baseline.md), validate an established application auth library backed by local Postgres. Use its supported session lifecycle; do not implement the Supabase bridge below. The ownership, provider-linking and authorization rules in this document still apply.

### EC2 authentication contract

Better Auth is the current candidate, pending version pinning and a real two-browser integration test. Use database-backed sessions with cookie caching disabled initially, and check the domain user's suspension/deletion state before private access. Cookie-cached sessions can otherwise delay revocation on other devices. Use the library's supported session schema; the opaque-token-hash bridge described below belongs to the Supabase alternative. [Session behavior](https://better-auth.com/docs/concepts/session-management).

Configure linking, token protection and deletion explicitly. Do not let automatic same-email provider linking substitute for the intended ownership policy; require a reviewed verified-provider/linking flow. Enable protected OAuth-token storage and a suitable hashed/encrypted OTP mode rather than inheriting their documented plaintext defaults. Route deletion through the domain's independent revocation journal and cleanup workflow before auth identity removal. [Account and deletion options](https://better-auth.com/docs/concepts/users-accounts), [OTP storage](https://better-auth.com/docs/plugins/email-otp).

Auth tables need a narrowly scoped role that can find sessions before an application owner context exists. Domain queries then use the restricted owner-scoped transaction role. The launch experiment must reject callback replay, OTP reuse, unintended linking, stale sessions after logout/suspension and deletion that bypasses the journal. Verify secure HttpOnly cookies, exact trusted origins and the selected library's CSRF controls on the actual HTTPS deployment; the earlier Supabase-specific refresh/token settings are not a configuration for Better Auth.

### Managed Supabase alternative

Use Supabase Auth for Google sign-in and verified email OTP. Email OTP gives recovery independent of a chess site; a Lichess connection is initially an integration after sign-in, not the only recovery mechanism. Add passkeys/MFA when the hosted integration has been tested; require MFA and recent authentication for administrative access.

Adopt a server-managed browser session. A per-request Supabase client uses PKCE and server-side storage; OAuth callbacks exchange the code on the API. The browser receives only a random 256-bit opaque application-session cookie. Store its hash, the provider session identifier, internal user ID, expiry and encrypted refresh material on the server. This is a deliberate BFF integration; it is not the standard Supabase browser SDK with its localStorage token store. The first implementation spike must test the customized storage and refresh lifecycle.[^supabase-advanced]

Cookie settings: `__Host-enpassant`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`. Rotate after sign-in, privilege changes and recovery. Proposed app limits are seven days idle and thirty days absolute, with a fifteen-minute provider access-token lifetime. The server checks application session validity and user suspension on every API request. Refresh tokens under a per-session lock so concurrent tabs cannot overwrite a newly rotated token. Supabase refresh semantics and reuse detection make this a concrete integration test, not an assumption.[^supabase-sessions]

The API verifies issuer, audience, signature, subject and expiry of provider identity material; it never derives identity from an arbitrary decoded JWT or request body. Refresh or sensitive actions additionally validate the provider session using the supported Auth API. Application logout, suspension and “sign out everywhere” revoke local sessions immediately. Revocation performed outside Enpassant may take up to the configured revalidation interval to appear; design for at most fifteen minutes, and require fresh provider validation for linking, account export and deletion.

Cookie authentication needs CSRF protection: exact allowed origins and a session-bound CSRF token for mutations, plus OAuth state and PKCE for callbacks. Do not use wildcard credentialed CORS. Callback and session responses must never enter shared caches. Auth clients must be request-scoped; a process-global client carrying a user's tokens is an account-leak risk.[^supabase-advanced]

Public email delivery needs a real SMTP service, verified sending domain and abuse controls. Supabase's default mail service is intended for testing, not arbitrary public registrations. Use Google sign-in plus custom SMTP from the first public launch; generic responses, provider CAPTCHA and per-IP/per-address budgets protect signup and OTP endpoints.[^smtp]

## Provider capability contract

| Capability                               | Lichess                                                              | Chess.com                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Import a public player's completed games | Supported                                                            | Supported through published archives                                                    |
| Verify control of the external account   | OAuth authorization code + PKCE; call authenticated account endpoint | Requires the separately approved authenticated integration; PubAPI alone cannot do this |
| Link as “verified mine” at first launch  | Yes, after successful OAuth                                          | Feature disabled until access and endpoint contract are confirmed                       |
| Initial public-source experience         | “Connect Lichess” or “Import public player”                          | “Add Chess.com games” with “public source; ownership not verified”                      |
| Refresh an authorization                 | No refresh-token flow; reconnect after expiry/revocation             | Implement only from approved provider documentation                                     |
| Private data access                      | Only explicitly supported scopes/endpoints                           | Not provided by PubAPI                                                                  |

Lichess supports public clients with PKCE S256 and long-lived access tokens, without refresh tokens. The account endpoint requires authentication but no additional scope; the user-game export also supports a no-additional-scope token. Request no gameplay, messaging, preference-writing or email scope for a public-game archive.[^lichess-auth][^lichess-account][^lichess-export]

Chess.com's official help page calls PubAPI read-only and directs developers seeking authentication to an application form. Do not invent OAuth URLs, ask for passwords, collect browser cookies, or use undocumented endpoints to simulate linking. Public-source importing keeps the feature useful while this external dependency remains unresolved.[^chesscom-help]

## Lichess connection flow

1. An authenticated person selects **Connect Lichess**. The API creates a ten-minute, single-use connection attempt with user ID, session binding, random state hash, PKCE verifier, expected provider and exact callback path.
2. The browser goes to Lichess's authorization endpoint with S256 and the minimum scopes. The API never accepts a caller-supplied arbitrary callback URL.
3. On return, the API checks the same signed-in person, session binding, state, expiry and unused attempt. Consume the attempt transactionally; reject replay. Denial leaves an actionable state without a partially verified account.
4. Exchange the code server-side, then call `/api/account`. The provider-returned account ID is authoritative; the username in an earlier form is not.
5. In one database transaction, check the active verified-owner uniqueness constraint, create/update the connection and record the verification timestamp. If another Enpassant user already owns it, return a conflict and a recovery path; never transfer it automatically.
6. Store the token encrypted, including key ID, expiry and granted scopes. The import worker can use this credential; engine and layout workers cannot. The UI shows the connected account and offers a bounded import.

On expiry or 401, change the connection to `reauthorization_required`; stop authenticated retries and preserve imported games. Reconnect repeats the proof and verifies the same account unless the person explicitly adds another connection. On unlink, stop schedules and new jobs immediately and attempt token revocation. If the provider is unavailable, move encrypted credential material into a revocation-only queue inaccessible to import workers; retry for a bounded period, then purge it and report that provider revocation could not be confirmed. No usable import credential remains. Lichess exposes a token-revocation endpoint.[^lichess-token]

Unlinking is distinct from deleting imported games. Present both choices clearly. Library data stays unless the person chooses deletion; any public verified badge disappears immediately. Do not fall back silently from a revoked verified connection to a public watcher and continue syncing after the person opted out.

## Chess.com public sources

Resolve the username against the official profile API. Keep the stable `player_id` when available and a current canonical username; provider documentation explicitly describes renames and notes that future ID availability is not guaranteed. Missing IDs remain unresolved public-source records, not verified identities.[^chesscom-profile]

Two users may add the same public player without becoming each other or claiming ownership. The UI may offer “study this player,” but public profile claims and future leaderboards require proof. Personal archive statistics carry a perspective label such as “Games of indigojeans — public source.” Imported PGN names alone never grant a badge or access to another user's library.

An approved Chess.com OAuth integration would populate the same verified-connection model after its actual identity, scope and revocation rules are checked. Keep the adapter behind a capability flag. Applying to the program is a product dependency, not a prerequisite for public archive import, and no application or external message has been sent as part of this design.

## Authorization matrix

| Action                                   | Guest            | Owner                                | Share visitor                 | Operator                                            |
| ---------------------------------------- | ---------------- | ------------------------------------ | ----------------------------- | --------------------------------------------------- |
| Local demo / local analysis              | Yes              | Yes                                  | Yes                           | Yes                                                 |
| Read private library, source list, notes | No               | Own resources only                   | No                            | No general access                                   |
| Import, sync, request server analysis    | No               | Own resources, within quota          | No                            | Operational retry only under a scoped grant         |
| Edit profile or connection               | No               | Own account; recent auth for linking | No                            | Suspend; cannot silently take ownership             |
| View a shared study                      | Valid share only | Yes                                  | Exact published snapshot only | Same rule or audited support access                 |
| Export or delete an account              | No               | Recent auth                          | No                            | Explicit audited support procedure                  |
| Read provider credentials                | Never            | Never returned through API           | Never                         | No UI access; tightly scoped connector runtime only |

Roles are not sufficient by themselves. Every read, update, child resource, object download and job-status request checks ownership or a specific share grant. Queries start from the authorized library/study row; knowing a game UUID or analysis hash does not grant access. A job's tenant is assigned from the session at creation and copied into trusted queue metadata, never supplied as authority by the client.

Use a non-owner `app_api` database role with `NOBYPASSRLS`. Set an internal user context **transaction-locally** after authentication and use RLS `USING` and `WITH CHECK` policies. Reset through transaction completion so pooled connections cannot leak tenants. The application schema is not exposed to anonymous/public API roles. Migration ownership, connector privileges and engine-result publication roles are separate. PostgreSQL owners and bypass roles can evade RLS, which is why a policy existing in SQL is not sufficient evidence of isolation.[^postgres-rls]

Composite foreign keys bind private child rows to the same owner as their parent. The API also checks authorization so malformed IDs produce a consistent not-found response rather than existence leaks. Tests must exercise wrong-owner reads, inserts, updates, object access and job events using the actual runtime database role.

## Sharing, privacy and deletion

A share points to an immutable study revision. Generate a high-entropy token, store only its hash, allow expiry and revocation, and redact private notes unless specifically included. Public profile publication and study publication are separate actions. Default shares are unlisted and excluded from indexing. Revocation is checked on every share request; do not hand out permanent public bucket URLs. Owner-only signed downloads may last up to five minutes, with that residual access window made explicit.

Private PGNs, tokens, opponent notes and full headers must not appear in logs. Provider avatars, PGN comments and annotations are untrusted input. Escape text, restrict markup and construct diagram labels through safe APIs. Raw uploads remain private and have no executable rendering path. Cross-user deduplication of private artifacts is disabled initially; predictable chess hashes must not expose whether another person has studied a position.

Account deletion starts by suspending sessions, imports, work leases and shares. A durable deletion job removes private object versions, study artifacts, notes, connections, tokens, library records and derived atlas contributions. Remove Auth identity last so an interrupted deletion remains traceable. Keep minimal, pseudonymous operational tombstones only for the documented retention window. Shared public game records can remain only when independently referenced; do not preserve a deleted user's private source merely because its moves match a public score.

Restore procedures must reapply deletion, suspension, unlink and share-revocation tombstones before making a restored database accessible. Keep that minimal recovery journal outside the database being restored, with retention at least as long as the oldest recoverable backup. Revoke restored application sessions and require sign-in again; do not resurrect a logged-out session from a snapshot. Database snapshots can retain deleted records until their retention expires; object backups require their own deletion policy. Publish retention and recovery limits with the product rather than promising immediate erasure from every backup.

A revocation operation has a stable ID and is durably appended to that journal before success is acknowledged. Apply its database denial idempotently; a crash between those steps leaves an operation to replay, not a revocation silently absent from recovery. Failed persistence returns a pending/error state, with local access denied where possible. Restore remains closed to traffic until the journal's cutoff and all entries are reconciled.

[^supabase-advanced]: Supabase, [Advanced server-side Auth guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide), checked 9 September 2026. The custom BFF storage and session policy above are Enpassant design choices.

[^supabase-sessions]: Supabase, [User sessions](https://supabase.com/docs/guides/auth/sessions), checked 9 September 2026.

[^smtp]: Supabase, [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), checked 9 September 2026.

[^lichess-auth]: Lichess, [Official API specification: authentication](https://github.com/lichess-org/api/blob/master/doc/specs/lichess-api.yaml), checked 9 September 2026.

[^lichess-account]: Lichess, [Authenticated account endpoint](https://github.com/lichess-org/api/blob/master/doc/specs/tags/account/api-account.yaml), checked 9 September 2026.

[^lichess-export]: Lichess, [User-game export contract](https://github.com/lichess-org/api/blob/master/doc/specs/tags/games/api-games-user-username.yaml), checked 9 September 2026.

[^lichess-token]: Lichess, [Token exchange and revocation](https://github.com/lichess-org/api/blob/master/doc/specs/tags/oauth/api-token.yaml), checked 9 September 2026.

[^chesscom-help]: Chess.com, [What is the PubAPI?](https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it), 20 April 2026; checked 9 September 2026.

[^chesscom-profile]: Chess.com, [Published-Data API: Player Profile](https://www.chess.com/news/view/published-data-api), checked 9 September 2026.

[^postgres-rls]: PostgreSQL, [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), checked 9 September 2026.
