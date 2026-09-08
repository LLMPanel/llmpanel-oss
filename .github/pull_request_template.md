## What this changes

<!-- The effect on the user, not the mechanism. -->

## Why

<!-- Link the issue if there is one. -->

## How it was tested

<!-- What you actually ran or clicked. "CI is green" on its own is not testing. -->

---

- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm build` pass
- [ ] Schema changes come with a generated migration (`pnpm --filter @llmpanel/db db:generate`)
- [ ] No new `any`, and no env var read outside a Zod schema

<!--
This repository is a mirror of a private monorepo, so a maintainer replays your
change upstream and it returns in the next sync commit. Your PR gets closed with
a link to the commit carrying it — that means merged, not rejected. See
CONTRIBUTING.md.
-->
