/*
 * A consumer, compiled the way a consumer compiles.
 *
 * `tests/surface.spec.ts` asserts what the declaration file *contains*. This
 * asserts what it *means*: that the exported types accept correct calls and
 * reject wrong ones. Every `@ts-expect-error` below is a negative test -- it
 * fails the build if the error stops happening, which is what makes a widened
 * type impossible to ship by accident.
 *
 * It compiles under `moduleResolution: nodenext`, the strictest resolver a
 * consumer is likely to use, because that is what caught the two defects this
 * file exists to prevent: a `.d.ts` importing `./types` with no extension, and
 * one importing a stylesheet.
 */
import { renderRadar } from 'pr-radar/render'
import type { RadarHandle, RadarOptions, RepoRef } from 'pr-radar/render'

const element: Element = document.createElement('div')
const repos: RepoRef[] = [{ owner: 'octocat', name: 'hello-world' }]

// The documented call.
const handle: RadarHandle = renderRadar(element, { token: 'ghp_x', repos })
handle.setRepos(repos)
handle.destroy()

// refreshInterval is optional, and a number when given.
renderRadar(element, { token: 'ghp_x', repos, refreshInterval: 0 })

// A token is required: forgetting it is the most likely mistake, so it must
// not be inferable as undefined.
// @ts-expect-error - token is required
renderRadar(element, { repos })

// @ts-expect-error - repos is required
renderRadar(element, { token: 'ghp_x' })

// @ts-expect-error - a repository is {owner, name}, not a "owner/name" string
renderRadar(element, { token: 'ghp_x', repos: ['octocat/hello-world'] })

// @ts-expect-error - refreshInterval is seconds, not a string
renderRadar(element, { token: 'ghp_x', repos, refreshInterval: '120' })

// @ts-expect-error - a typo in an option is an error, not a silently ignored key
renderRadar(element, { token: 'ghp_x', repos, refresInterval: 60 })

// @ts-expect-error - the element is not optional
renderRadar({ token: 'ghp_x', repos })

// The handle is the whole contract: nothing else is reachable through it.
// @ts-expect-error - there is no `refetch` on the handle
handle.refetch()

// Internals stay internal. If either of these ever resolves, the surface has
// grown without anyone deciding that it should.
// @ts-expect-error - PullRequest is not part of the public surface
export type { PullRequest } from 'pr-radar/render'
// @ts-expect-error - there is no root export, only subpaths
export { renderRadar as fromRoot } from 'pr-radar'

const options: RadarOptions = { token: 'ghp_x', repos }
export { options }
