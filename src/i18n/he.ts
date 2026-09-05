import type { Catalogue } from './types'
import type { Messages } from './en'

/**
 * Hebrew.
 *
 * Typed as a complete catalogue, so this file cannot be missing a key, cannot be
 * missing a plural form Hebrew needs, and cannot drift when English gains a
 * message -- each of those is a compile error, not a string that shows up as a
 * key in front of a user.
 *
 * Hebrew has a `two` form that English does not. `שתי מאגרים` is wrong; two of
 * something takes its own word. That form has no place to live in an
 * English-shaped catalogue, which is why the plural categories are typed per
 * locale rather than assumed to be one and other.
 */
export const he: Catalogue<Messages, 'he'> = {
  'app.name': 'PR Radar',
  'app.tagline': 'כל בקשות המשיכה הפתוחות מכל המאגרים שלך, במסך אחד.',

  'welcome.continue': 'המשך לרדאר',

  'gate.signIn': 'התחברות עם GitHub',
  'gate.signInStarting': 'מתחיל…',
  'gate.or': 'או הדבקת טוקן',
  'gate.tokenLabel': 'טוקן גישה אישי של GitHub',
  'gate.tokenPlaceholder': '‎ghp_… או github_pat_…',
  'gate.verifying': 'מאמת…',
  'gate.continue': 'המשך',
  'gate.tokenUnverified': 'לא הצלחנו לאמת את הטוקן.',

  'signIn.enterCodeAt': 'הזינו את הקוד הזה בכתובת',
  'signIn.waiting': 'ממתינים לאישור שלך…',
  'signIn.cancel': 'ביטול',
  'signIn.failed.denied': 'ההתחברות בוטלה ב-GitHub.',
  'signIn.failed.expired': 'הקוד פג. קוד תקף לכחמש עשרה דקות.',
  'signIn.failed.unsupported': 'בהתקנה הזו אי אפשר להתחבר עם חשבון GitHub.',
  'signIn.failed.network': 'לא הצלחנו להגיע ל-GitHub.',
  'signIn.failed.unknown': 'ההתחברות לא הושלמה.',

  'header.repositories': {
    one: 'מאגר אחד',
    two: 'שני מאגרים',
    other: '{count} מאגרים',
  },
  'header.manageRepositories': 'מאגרים',
  'header.done': 'סיום',
  'header.signOut': 'התנתקות',
  'header.language': 'שפה',

  'repos.empty': 'הוסיפו מאגר למעלה כדי להתחיל.',
  'filter.placeholder': 'סינון: is:draft author:@me label:bug -repo:acme/web sort:created-desc',
  'filter.label': 'סינון בקשות משיכה',
  'filter.ignored': 'התעלמנו (לא נתמך):',
  'menus.noMatch': 'שום דבר כאן לא תואם את הסינון הנוכחי.',

  'notify.label': 'התראות',
  'notify.on': 'ההתראות פעילות',
  'notify.off': 'ההתראות כבויות',
  'notify.heading': 'הודיעו לי כאשר…',
  'notify.unsupported': 'הדפדפן הזה לא תומך בהתראות. כותרת הלשונית עדיין מציגה כמה בקשות משיכה ממתינות לכם.',
  'notify.granted': 'ההתראות פעילות. הן מגיעות כל עוד הלשונית פתוחה — אין כאן שרת שידחוף אליכם כשהיא סגורה. כותרת הלשונית תמיד מציגה את המספר.',

  'repos.placeholder': 'owner/repo, כתובת GitHub, או שם ארגון כדי להוסיף את כל המאגרים שלו',
  'repos.add': 'הוספת מאגר',

  'views.namePlaceholder': 'שם לתצוגה',
  'views.nameLabel': 'שם התצוגה השמורה',

  'radar.loading': 'טוענים בקשות משיכה…',

  'welcome.pitch': 'GitHub כבר יודע להציג רשימת בקשות משיכה. מה שהוא לא עושה זה להגיד לכם, על פני כל המאגרים בבת אחת, אילו מהן באמת ממתינות <1>לכם</1>. בשביל זה זה כאן. לחיצה על אחת מהן פותחת אותה ב-GitHub — כאן שמים לב לדברים, לא כאן עושים אותם.',
  'welcome.whyToken': 'למה צריך טוקן',
  'welcome.noServer': '<1>אין שרת</1> מאחורי הדף הזה. הוא רץ כולו בדפדפן שלכם ופונה ישירות אל <2>api.github.com</2>, ולכן הוא צריך את ההרשאות שלכם כדי לקרוא משהו. אין חשבון להירשם אליו, כי אין למה.',
  'welcome.pointTabOnly': 'הטוקן נשמר בלשונית הזו בלבד, <1>ונמחק כשסוגרים אותה</1>.',
  'welcome.pointGitHubOnly': 'הוא נשלח ל-GitHub ולשום מקום אחר. הדף אוכף את זה, לא רק מבטיח.',
  'welcome.pointPublic': 'עוקבים רק אחרי מאגרים ציבוריים? לא נדרשות הרשאות בכלל.',
  'welcome.step1': '<1>צרו טוקן</1> — הקישור הזה ממלא הכול. גללו למטה ולחצו <2>Generate token</2>.',
  'welcome.step2': 'הדביקו אותו במסך הבא.',
  'welcome.step3': 'הוסיפו מאגר — <1>facebook/react</1>, או פשוט <2>facebook</2> לארגון שלם.',
  'welcome.source': '<1>קראו את הקוד</1> — זו כל האפליקציה.',

  'gate.createToken': 'צרו טוקן',
  'gate.scopes': 'עם <1>repo</1> (מאגרים פרטיים) ו-<2>read:org</2> (כדי לפרוש ארגון לכל המאגרים שלו). למאגרים ציבוריים בלבד לא נדרשות הרשאות כלל.',
  'gate.storage': 'הטוקן נשמר ב-<1>sessionStorage</1> של הלשונית הזו ונשלח רק אל <2>api.github.com</2>. לדף הזה אין שרת: שום דבר שתקלידו לא יוצא מהדפדפן שלכם, חוץ מאשר אל GitHub עצמו.',
  'action.clear': 'ניקוי',
  'action.save': 'שמירה',
  'action.add': 'הוספה',
  'action.refresh': 'רענון',
  'action.refreshing': 'מרעננים…',
  'action.lookingUp': 'מחפשים…',

  'facet.noFilter': 'אין סינון בציר הזה',
  'menus.period': 'תקופה',
  'views.title': 'תצוגות',

  'notify.blocked': 'נחסם על ידי הדפדפן',
  'notify.enable': 'הפעלת התראות',

  'repos.lookupFailed': 'החיפוש נכשל.',
  'radar.noneOpen': 'אין בקשות משיכה פתוחות במאגרים האלה.',

  'state.draft': 'טיוטה',
  'state.merged': 'מוזגה',
  'state.closed': 'נסגרה',
  'state.open': 'פתוחה',

  'review.approved': 'אושרה',
  'review.changesRequested': 'התבקשו שינויים',
  'review.required': 'נדרשת סקירה',

  'checks.passed': 'כל הבדיקות עברו',
  'checks.failed': 'חלק מהבדיקות נכשלו',
  'checks.running': 'הבדיקות רצות',
  'radar.noMatch': 'אין בקשות משיכה שתואמות את הסינון הזה.',
  'axis.status': 'סטטוס',
  'axis.who': 'מי',
  'axis.state': 'מצב',
  'axis.drafts': 'טיוטות',

  'axis.status.open': 'פתוחות',
  'axis.status.merged': 'מוזגו',
  'axis.status.closed': 'נסגרו ללא מיזוג',
  'axis.status.all': 'הכול',

  'axis.who.anyone': 'כולם',
  'axis.who.mine': 'שלי',
  'axis.who.toReview': 'לסקירה שלי',
  'axis.who.reviewed': 'סקרתי',
  'axis.who.involves': 'מעורב בהן',

  'axis.state.any': 'הכול',
  'axis.state.awaiting': 'ממתינות לסקירה',
  'axis.state.approved': 'אושרו',
  'axis.state.changes': 'התבקשו שינויים',
  'axis.state.ciRed': 'בדיקות נכשלות',
  'axis.state.stale': 'תקועות 7 ימים+',

  'axis.drafts.shown': 'מוצגות',
  'axis.drafts.only': 'רק הן',
  'axis.drafts.hidden': 'מוסתרות',

  'menu.repository': 'מאגר',
  'menu.author': 'מחבר',
  'menu.label': 'תווית',
  'menu.assignee': 'אחראי',
  'menu.reviewer': 'סוקר',
  'menu.sort': 'מיון',

  'period.week': 'השבוע האחרון',
  'period.month': 'החודש האחרון',
  'period.threeMonths': 'שלושת החודשים האחרונים',
  'period.year': 'השנה האחרונה',
  'period.all': 'כל הזמן',

  'sort.updatedDesc': 'עודכנו לאחרונה',
  'sort.updatedAsc': 'עודכנו מזמן',
  'sort.createdDesc': 'החדשות ביותר',
  'sort.createdAsc': 'הישנות ביותר',
  'sort.mergedDesc': 'מוזגו לאחרונה',
  'sort.mergedAsc': 'מוזגו ראשונות',

  'views.saveCurrent': '+ שמירת הנוכחי',
  'filter.try': 'נסו',
  'row.by': 'מאת {author}',
  'row.opened': 'נפתחה {when}',
  'row.updated': 'עודכנה {when}',
  // A hyphen before the name, which is how Hebrew attaches a one-letter
  // preposition to a foreign word: 'ממתינה ל-octocat', never 'ממתינה לoctocat'.
  'row.waitingOn': 'ממתינה ל-{who}',
  'menus.filterBy': 'סינון לפי {what}',
  'menus.searchIn': 'חיפוש {what}',
  'menus.filterThe': 'סינון {what}',
  'notifyRule.reviewRequested': 'מישהו מבקש את הסקירה שלי',
  'notifyRule.approved': 'בקשת המשיכה שלי אושרה',
  'notifyRule.changesRequested': 'התבקשו שינויים בבקשת המשיכה שלי',
  'notifyRule.ciFailed': 'הבדיקות נכשלו בבקשת המשיכה שלי',

  'notifyHeadline.reviewRequested': 'התבקשה סקירה',
  'notifyHeadline.approved': 'אושרה',
  'notifyHeadline.changesRequested': 'התבקשו שינויים',
  'notifyHeadline.ciFailed': 'הבדיקות נכשלו',

  'error.tokenRejected': 'GitHub דחה את הטוקן. ייתכן שפג תוקפו או שבוטל.',
  'error.unreachable': 'לא הצלחנו להגיע ל-api.github.com. בדקו את החיבור, ואם תוסף בדפדפן חוסם את הבקשה.',
  'error.rateLimit': 'הגעתם למגבלת הקצב של GitHub. היא מתאפסת ב-{when}.',
  'error.rateLimitSoon': 'עוד מעט',
  'error.forbidden': 'GitHub דחה את הבקשה. ייתכן שלטוקן חסרות ההרשאות למאגר הזה.',
  'error.status': 'GitHub החזיר {status} {statusText}',
  'error.noUserRead': 'הטוקן התקבל אבל לא הצלחנו לקרוא ממנו משתמש.',
  'error.noSuchOwner': 'אין משתמש או ארגון בשם ״{login}״ שהטוקן הזה רואה.',
  'error.requestFailed': 'הבקשה נכשלה.',
  'row.merged': 'מוזגה {when}',
  'filter.openCount': '{count} פתוחות',
  'filter.ofTotal': '{shown} מתוך {total}',
  'action.menu': 'פעולות',
  'action.merge': 'מיזוג',
  'action.close': 'סגירה',
  'action.reopen': 'פתיחה מחדש',
  'action.cancel': 'ביטול',
  'action.working': 'מבצעים…',

  'action.notOpen': 'רק בקשת משיכה פתוחה ניתנת לשינוי מכאן.',
  'action.isDraft': 'אי אפשר למזג טיוטה. סמנו אותה מוכנה לסקירה ב-GitHub קודם.',
  'action.mergeabilityUnknown': 'GitHub עדיין בודק אם אפשר למזג את זה.',
  'action.hasConflicts': 'יש בענף הזה התנגשויות שצריך לפתור קודם.',
  'action.blocked': 'סקירה או בדיקה נדרשת עוד לא עברה.',
  'action.behind': 'הענף הזה מפגר אחרי ענף הבסיס וצריך לעדכן אותו קודם.',
  'action.notMergeable': 'GitHub אומר שאי אפשר למזג את זה כרגע.',

  'action.method.merge': 'יצירת קומיט מיזוג',
  'action.method.squash': 'כיווץ ומיזוג',
  'action.method.rebase': 'ריבייס ומיזוג',

  'action.confirmMerge': 'למזג את {pr}?',
  'action.confirmMergeBody': 'הפעולה מוסיפה את הקומיטים לענף הבסיס. אי אפשר לבטל אותה מכאן.',
  'action.confirmClose': 'לסגור את {pr}?',
  'action.confirmCloseBody': 'שום דבר לא ימוזג. אפשר לפתוח מחדש מכאן.',

  'action.failed.forbidden': 'לטוקן הזה אין הרשאת כתיבה למאגר הזה.',
  'action.failed.notFound': 'בקשת המשיכה הזו כבר לא נראית לטוקן הזה.',
  'action.failed.notMergeable': 'GitHub סירב למזג. ייתכן שהענף הפך לבלתי ניתן למיזוג.',
  'action.failed.changed': 'מישהו דחף לענף בזמן שזה היה פתוח. רעננו והסתכלו שוב.',
  'action.failed.rejected': 'GitHub דחה את הבקשה. ייתכן שכלל ענף אוסר עליה.',
  'action.failed.unknown': 'הפעולה לא הושלמה.',
  'action.merged': 'מוזגה {pr}.',
  'action.closed': 'נסגרה {pr}.',
  'action.reopened': 'נפתחה מחדש {pr}.',
  'row.assigned': 'אחראי: {who}',
  'notify.allowInBrowser': 'אפשרו התראות לאתר הזה בהגדרות הדפדפן כדי להפעיל אותן.',
  'notify.tabOnly': 'הן מגיעות כל עוד הלשונית פתוחה. אין כאן שרת שידחוף אליכם כשהיא סגורה.',
  'loading.label': 'טוענים בקשות משיכה',
}
