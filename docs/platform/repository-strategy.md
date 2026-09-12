# Repository visibility and licensing

**A public app does not require a private repository.** User data is protected by authentication, authorization, storage permissions and secret management. Repository visibility determines who can browse development work; it is a separate product and collaboration choice.

On 9 September 2026, GitHub reports `jeanluciradukunda/enpassant` as **public**, under the personal account. [README](../../README.md), [package metadata](../../package.json), [LICENSE](../../LICENSE) and [attribution](../ATTRIBUTION.md) identify application code as GPL-3.0-or-later. The `private: true` field in `package.json` prevents accidental npm publication; it does not make the GitHub repo private.

## Recommendation

Keep the existing visualizer and its research public for now. If hosted-product development should be confidential, use a **private platform repository consuming a versioned visualizer release**. That keeps the diagram work easy to share while letting product operations and unreleased plans evolve privately. The platform repository is not thereby automatically proprietary: shared code and distributed components retain their licences.

Do not create the split merely for secrecy around credentials. Secrets, production Terraform state/plans, private PGNs, database dumps and support exports belong outside either repository. Public Terraform modules and workflows can be safe; a private checkout is still the wrong place for secret values. CI logs and artifacts need the same separation.

| Choice                                   | Benefits                                                                                     | Trade-offs                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Keep one public repo**                 | Least release coordination; shareable research and examples; standard public CI remains free | Product implementation is visible; privileged jobs and operational artifacts need careful isolation |
| **Public visualizer + private platform** | Fits a reusable diagram tool plus a hosted service; independent disclosure choices           | Two release streams; pin package versions/contracts and keep extraction small                       |
| **Make the current repo private**        | Simplest single-repo confidential development going forward                                  | Private-repo CI/plan rules apply; existing public copies remain; licence obligations remain         |

A split should follow real package boundaries: browser chess/diagram contracts and published engine/source bundles on the public side; independently authored account/API/worker/infrastructure code and operational runbooks on the platform side. Document dependencies and ownership. A network endpoint or a second Git repository is not, by itself, proof that two programs are legally independent. Settle that question before describing the platform as closed-source.

## What GPL means here

The licence permits private modification and commercial activity. It does not require the development repository itself to be public. But distributing covered software carries licence and corresponding-source obligations. Browser JavaScript and Stockfish WASM delivered to visitors need a distribution-aware release process. Private GitHub URLs inaccessible to recipients are not a substitute for source access. Pure server-side use under ordinary GPL differs from AGPL's network terms.[^gnu-faq]

Existing recipients retain rights already granted under the licence; making the repo private cannot recall their copies. Public GitHub forks are detached and remain public after a visibility change.[^license][^visibility]

For Enpassant, keep accessible licence notices and corresponding source for each distributed covered release, including Stockfish.js and its build material. The current attribution already records the engine revision and separate paper-artwork rights. A future licence change needs an inventory of copyright holders, contributions and third-party components; do not relabel everything by editing `package.json`. Obtain a focused licensing review if a proprietary distribution is the chosen business direction. No relicensing is proposed here.

## Practical cost and workflow consequences

Private repositories are available on GitHub Free, but the recommended protected development/deployment setup needs the relevant paid capabilities. For a private personal repo, budget for GitHub Pro if not already held; for an organization, compare Team seats. Standard public Actions usage is free; private usage draws from account-wide included minutes and then metered usage. Paid private code-scanning/security features are separate from basic repository privacy.[^visibility][^actions]

Check the exact deployment controls before changing visibility: Free/Pro/Team public repositories can use required environment reviewers, but Pro/Team private repositories cannot use that particular protection rule. Environment secrets and branch restrictions are available for private repos on Pro/Team. The [CI/CD design](ci-cd-and-costs.md#workflow-permissions-and-production-controls) specifies a manual maintainer promotion path and explicitly distinguishes it from independent approval.[^environments]

GitHub's repository visibility control does not automatically make packages, old forks, release copies or published websites follow the intended new boundary. Inspect GHCR permissions separately. Browser code is still delivered to visitors even when its development history is private.

If the current repo is eventually made private, first inventory the account plan, branch/environment rules, packages and externally referenced source bundles. Verify deployment integrations can still fetch it and recipients can still access the required source. Preserve release provenance and the existing public history's licensing. This is preparation for an explicit future decision; repository visibility, ownership and licence were not changed during this research.

[^gnu-faq]: Free Software Foundation, [GPL FAQ: private modifications](https://www.gnu.org/licenses/gpl-faq.en.html#GPLRequireSourcePostedPublic) and [server use versus distributed browser programs](https://www.gnu.org/licenses/gpl-faq.en.html#UnreleasedMods), checked through indexed official text on 9 September 2026.

[^license]: [The repository's GPLv3 text](../../LICENSE), particularly sections 2, 6 and 10. Applied licence declaration: GPL-3.0-or-later in the README and package metadata.

[^visibility]: GitHub, [Consequences of repository visibility changes](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility), checked 9 September 2026.

[^actions]: GitHub, [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), checked 9 September 2026.

[^environments]: GitHub, [Managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), checked 9 September 2026.
