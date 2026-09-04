# Security

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/AryeBorgen/pr-radar/security/advisories/new).
Please do not open a public issue for anything exploitable.

Expect an acknowledgement within a few days. If a fix is warranted it ships as a
patch release and the advisory is published alongside it, crediting you unless
you would rather stay anonymous.

## What this project is, in security terms

PR Radar is a static page. There is no server, no database, no account and no
component of it that holds anyone's data. It runs entirely in your browser and
talks to exactly one host: `api.github.com`.

That shape removes most of the attack surface a dashboard would normally have,
and concentrates what remains in one place: **the personal access token you
paste in**.

### How the token is handled

- It is kept in `sessionStorage`, so it is gone when the tab closes. It is never
  written to disk by this app.
- It is sent to `api.github.com` and nowhere else. The Content-Security-Policy
  in `index.html` enforces this in the browser rather than merely promising it:
  `connect-src` names GitHub's API and nothing more, so even a compromised
  dependency cannot post the token to another host.
- It is never logged, never placed in a URL, and never sent to this project's
  maintainers, because there is nowhere for it to be sent.

### What you can do to reduce the blast radius

- Prefer a **fine-grained token** scoped to the repositories you actually want
  to watch, read-only. Public repositories need no scopes at all.
- On a shared or untrusted machine, treat the token as you would a password
  typed into that machine, because that is what it is.
- Revoke it at any time from
  [github.com/settings/tokens](https://github.com/settings/tokens); nothing in
  this project needs to be told.

## How the supply chain is protected

The realistic attack on a project like this is not against the running page. It
is against the pipeline that builds and publishes it.

- **Every GitHub Action is pinned to a commit SHA**, never a tag. A tag is a
  pointer its owner can move; a SHA cannot be moved. `scripts/lint-workflows.sh`
  fails the build if any `uses:` is left on a tag, and Dependabot keeps the pins
  current so the safety does not cost staleness.
- **Every workflow declares least-privilege `permissions:`.** The same linter
  fails a workflow that omits the block and would otherwise inherit whatever the
  repository default happens to be.
- **No workflow uses `pull_request_target`**, and none interpolates
  attacker-controlled text -- a pull request title, a comment body, a branch
  name -- into a shell command. Both are checked mechanically, because both are
  the kind of thing a hurried edit reintroduces.
- **Published artifacts carry provenance**, in two forms that are easy to
  confuse. The image is built with `provenance: mode=max` and an SBOM, which
  BuildKit attaches to the image, *and* it is attested to this repository with
  `actions/attest-build-provenance`, which is the record `gh attestation verify`
  reads. They are separate systems: an earlier version of this file documented
  the second while the workflow produced only the first, so the command below
  answered 404. The npm package publishes with `--provenance`.
- **CodeQL** runs on every pull request and weekly, so a rule written after a
  merge still gets a chance to find something.
- **Secret scanning and push protection** are enabled on the repository.

## Verifying what you install

The container image, two independent ways:

```bash
# GitHub's attestation: which workflow, at which commit, built this digest.
gh attestation verify oci://ghcr.io/aryeborgen/pr-radar:latest --owner AryeBorgen

# BuildKit's own record, carried inside the image.
docker buildx imagetools inspect ghcr.io/aryeborgen/pr-radar:latest \
  --format '{{json .Provenance}}'
```

The first works for images published after 2026-09-04; earlier digests carry
only the second.

The npm package publishes with provenance, which npm displays on the package
page and `npm view pr-radar` reports.

Neither is a substitute for reading the source, which is the whole of the
application and is deliberately small.
