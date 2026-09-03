<!--
Thanks for sending this. Nothing below is a hurdle -- it is what a reviewer
would otherwise have to ask for.
-->

## What this changes

<!-- One or two sentences. The why matters more than the what. -->

## How you know it works

<!--
Which command you ran and what it printed. If you fixed a bug, the useful thing
is a test that fails before the change and passes after it -- that is what makes
it a regression test rather than decoration.
-->

```
```

- [ ] `npm run test:all` passes
- [ ] If it touches the servers or the Dockerfile: `scripts/cli-smoke.sh` and `docker/smoke.sh`
- [ ] If it touches a workflow: `scripts/lint-workflows.sh`
- [ ] If it makes a comment or a note in `CLAUDE.md` wrong, that note is updated
