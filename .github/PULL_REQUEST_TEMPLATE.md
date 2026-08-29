<!--
This repo builds every feature test-first and often as a stack of small PRs
against one issue. Fill in what applies; delete what doesn't.
See AGENTS.md → "Multi-agent implementation workflow" for the full convention.
-->

## What this does

Closes #<!-- issue number -->
<!-- If this is one PR in a stack for that issue, say so and link the base PR: -->
<!-- Stacked on #<!-- base PR --> -->

## TDD checklist

- [ ] A failing test was written first, committed before the implementation commit
- [ ] The test fails for the right reason (verified before writing the fix)
- [ ] Implementation makes it pass, no unrelated changes bundled in
- [ ] `pytest` / `npm test` pass locally (paste output below once #17 lands; until
      then, describe how you manually verified)

## Dependencies

<!-- List any issue/PR this one is blocked by or stacked on, per the issue's
     "Dependencies" comment. Delete if none. -->

## Notes for the reviewer

<!-- Anything a reviewer should specifically check: a snapshot-immutability
     rule, a GoBD/§14 UStG constraint, a security-sensitive path, etc. -->
