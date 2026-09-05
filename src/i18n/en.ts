/**
 * English, and the schema for everything else.
 *
 * `as const` is load-bearing: it is what turns each message into a literal type,
 * which is what lets `t()` know a message's placeholders and refuse a call that
 * gets them wrong. Removing it would silently disable most of this system.
 *
 * Keys are grouped by where they appear rather than by what they say, so a
 * change to one screen touches one region of this file.
 */
export const en = {
  'app.name': 'PR Radar',
  'app.tagline': 'Every open pull request across all your repositories, on one screen.',

  'welcome.continue': 'Continue to the radar',

  'gate.signIn': 'Sign in with GitHub',
  'gate.signInStarting': 'Starting…',
  'gate.or': 'or paste a token',
  'gate.tokenLabel': 'GitHub personal access token',
  'gate.tokenPlaceholder': 'ghp_… or github_pat_…',
  'gate.verifying': 'Verifying…',
  'gate.continue': 'Continue',
  'gate.tokenUnverified': 'Could not verify the token.',

  'signIn.enterCodeAt': 'Enter this code at',
  'signIn.waiting': 'Waiting for you to approve it…',
  'signIn.cancel': 'Cancel',
  'signIn.failed.denied': 'Sign-in was cancelled on GitHub.',
  'signIn.failed.expired': 'That code expired. Codes last about fifteen minutes.',
  'signIn.failed.unsupported': 'This deployment cannot sign in with a GitHub account.',
  'signIn.failed.network': 'Could not reach GitHub.',
  'signIn.failed.unknown': 'Sign-in did not complete.',

  'header.repositories': {
    one: '{count} repository',
    other: '{count} repositories',
  },
  'header.manageRepositories': 'Repositories',
  'header.done': 'Done',
  'header.signOut': 'Sign out',
  'header.language': 'Language',

  'repos.empty': 'Add a repository above to get started.',
  'filter.placeholder': 'Filter: is:draft author:@me label:bug -repo:acme/web sort:created-desc',
  'filter.label': 'Filter pull requests',
  'filter.ignored': 'Ignored (not supported):',
  'menus.noMatch': 'Nothing here matches the current filters.',

  'notify.label': 'Notifications',
  'notify.on': 'Notifications are on',
  'notify.off': 'Notifications are off',
  'notify.heading': 'Notify me when…',
  'notify.unsupported': 'This browser does not support notifications. The tab title still shows how many pull requests are waiting on you.',
  'notify.granted': 'Notifications are on. They arrive while this tab is open — there is no server here to push to you when it is closed. The tab title always shows the count.',

  'repos.placeholder': 'owner/repo, a GitHub URL, or an org name to add all its repos',
  'repos.add': 'Add a repository',

  'views.namePlaceholder': 'Name this view',
  'views.nameLabel': 'Name for the saved view',

  'radar.loading': 'Loading pull requests…',

  'welcome.pitch': 'GitHub can already list pull requests. What it cannot do is tell you, across every repository at once, which ones are actually waiting on <1>you</1>. That is what this is for. Clicking one takes you to it on GitHub — this is where you notice things, not where you do them.',
  'welcome.whyToken': 'Why it asks for a token',
  'welcome.noServer': 'There is <1>no server</1> behind this page. It runs entirely in your browser and talks to <2>api.github.com</2> directly, so it needs your own credentials to read anything. There is no account to create, because there is nothing to create it on.',
  'welcome.pointTabOnly': 'The token is kept in this tab only, and is <1>gone when you close it</1>.',
  'welcome.pointGitHubOnly': 'It is sent to GitHub and to nowhere else. The page enforces that, not just promises it.',
  'welcome.pointPublic': 'Watching only public repositories? It needs no permissions at all.',
  'welcome.step1': '<1>Create a token</1> — that link fills in everything. Scroll down and press <2>Generate token</2>.',
  'welcome.step2': 'Paste it on the next screen.',
  'welcome.step3': 'Add a repository — <1>facebook/react</1>, or just <2>facebook</2> for a whole organisation.',
  'welcome.source': '<1>Read the source</1> — it is the whole of the application.',

  'gate.createToken': 'Create a token',
  'gate.scopes': 'with <1>repo</1> (private repositories) and <2>read:org</2> (to expand an organisation into its repos). Public repositories alone need no scopes at all.',
  'gate.storage': "The token is kept in this tab's <1>sessionStorage</1> and is sent only to <2>api.github.com</2>. This page has no server: nothing you enter leaves your browser except to GitHub itself.",
  'action.clear': 'Clear',
  'action.save': 'Save',
  'action.add': 'Add',
  'action.refresh': 'Refresh',
  'action.refreshing': 'Refreshing…',
  'action.lookingUp': 'Looking up…',

  'facet.noFilter': 'No filter on this axis',
  'menus.period': 'Period',
  'views.title': 'Views',

  'notify.blocked': 'Blocked by the browser',
  'notify.enable': 'Enable notifications',

  'repos.lookupFailed': 'Lookup failed.',
  'radar.noneOpen': 'No open pull requests in these repositories.',

  'state.draft': 'Draft',
  'state.merged': 'Merged',
  'state.closed': 'Closed',
  'state.open': 'Open',

  'review.approved': 'Approved',
  'review.changesRequested': 'Changes requested',
  'review.required': 'Review required',

  'checks.passed': 'All checks passed',
  'checks.failed': 'Some checks failed',
  'checks.running': 'Checks running',
  'radar.noMatch': 'No pull requests match this filter.',
  'axis.status': 'Status',
  'axis.who': 'Who',
  'axis.state': 'State',
  'axis.drafts': 'Drafts',

  'axis.status.open': 'Open',
  'axis.status.merged': 'Merged',
  'axis.status.closed': 'Closed unmerged',
  'axis.status.all': 'All',

  'axis.who.anyone': 'Anyone',
  'axis.who.mine': 'Mine',
  'axis.who.toReview': 'To review',
  'axis.who.reviewed': 'I reviewed',
  'axis.who.involves': 'Involves me',

  'axis.state.any': 'Any',
  'axis.state.awaiting': 'Awaiting review',
  'axis.state.approved': 'Approved',
  'axis.state.changes': 'Changes requested',
  'axis.state.ciRed': 'CI failing',
  'axis.state.stale': 'Stale 7d+',

  'axis.drafts.shown': 'Shown',
  'axis.drafts.only': 'Only',
  'axis.drafts.hidden': 'Hidden',

  'menu.repository': 'Repository',
  'menu.author': 'Author',
  'menu.label': 'Label',
  'menu.assignee': 'Assignee',
  'menu.reviewer': 'Reviewer',
  'menu.sort': 'Sort',

  'period.week': 'Past week',
  'period.month': 'Past month',
  'period.threeMonths': 'Past 3 months',
  'period.year': 'Past year',
  'period.all': 'All time',

  'sort.updatedDesc': 'Recently updated',
  'sort.updatedAsc': 'Least recently updated',
  'sort.createdDesc': 'Newest',
  'sort.createdAsc': 'Oldest',
  'sort.mergedDesc': 'Recently merged',
  'sort.mergedAsc': 'First merged',

  'views.saveCurrent': '+ Save current',
  'filter.try': 'Try',
  'row.by': 'by {author}',
  'row.opened': 'opened {when}',
  'row.updated': 'updated {when}',
  'row.waitingOn': 'waiting on {who}',
  'menus.filterBy': 'Filter by {what}',
  'menus.searchIn': 'Search {what}',
  'menus.filterThe': 'Filter {what}',
  'notifyRule.reviewRequested': 'Someone asks for my review',
  'notifyRule.approved': 'My PR is approved',
  'notifyRule.changesRequested': 'Changes requested on my PR',
  'notifyRule.ciFailed': 'CI fails on my PR',

  'notifyHeadline.reviewRequested': 'Review requested',
  'notifyHeadline.approved': 'Approved',
  'notifyHeadline.changesRequested': 'Changes requested',
  'notifyHeadline.ciFailed': 'Checks failed',

  'error.tokenRejected': 'GitHub rejected the token. It may be expired or revoked.',
  'error.unreachable': 'Could not reach api.github.com. Check your connection, and whether a browser extension is blocking the request.',
  'error.rateLimit': 'GitHub rate limit reached. It resets at {when}.',
  'error.rateLimitSoon': 'shortly',
  'error.forbidden': 'GitHub refused the request. The token may lack the scopes for this repository.',
  'error.status': 'GitHub returned {status} {statusText}',
  'error.noUserRead': 'Token accepted but no user could be read from it.',
  'error.noSuchOwner': 'No user or organisation named “{login}” is visible to this token.',
  'error.requestFailed': 'Request failed.',
  'row.merged': 'merged {when}',
  'filter.openCount': '{count} open',
  'filter.ofTotal': '{shown} of {total}',
  'action.menu': 'Actions',
  'action.merge': 'Merge',
  'action.close': 'Close',
  'action.reopen': 'Reopen',
  'action.cancel': 'Cancel',
  'action.working': 'Working…',

  'action.notOpen': 'Only an open pull request can be changed from here.',
  'action.isDraft': 'A draft cannot be merged. Mark it ready for review on GitHub first.',
  'action.mergeabilityUnknown': 'GitHub is still working out whether this can merge.',
  'action.hasConflicts': 'This branch has conflicts that must be resolved first.',
  'action.blocked': 'A required review or check has not passed yet.',
  'action.behind': 'This branch is behind its base and must be updated first.',
  'action.notMergeable': 'GitHub says this cannot be merged right now.',

  'action.method.merge': 'Create a merge commit',
  'action.method.squash': 'Squash and merge',
  'action.method.rebase': 'Rebase and merge',

  'action.confirmMerge': 'Merge {pr}?',
  'action.confirmMergeBody': 'This lands the commits on the base branch. It cannot be undone from here.',
  'action.confirmClose': 'Close {pr}?',
  'action.confirmCloseBody': 'Nothing is merged. It can be reopened again from here.',

  'action.failed.forbidden': 'This token is not allowed to write to that repository.',
  'action.failed.notFound': 'That pull request is no longer visible to this token.',
  'action.failed.notMergeable': 'GitHub refused the merge. The branch may have become unmergeable.',
  'action.failed.changed': 'Someone pushed to the branch while this was open. Refresh and look again.',
  'action.failed.rejected': 'GitHub rejected the request. A branch rule may forbid it.',
  'action.failed.unknown': 'The action did not complete.',
  'action.merged': 'Merged {pr}.',
  'action.closed': 'Closed {pr}.',
  'action.reopened': 'Reopened {pr}.',
  'row.assigned': 'Assigned: {who}',
  'notify.allowInBrowser': 'Allow notifications for this site in your browser settings to turn them on.',
  'notify.tabOnly': 'They arrive while this tab is open. There is no server here to push to you when it is closed.',
} as const

export type MessageKey = keyof typeof en
export type Messages = typeof en
