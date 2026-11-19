# Waitlist backend (Google Apps Script)

The Team waitlist form on `site/index.html` (`#waitlist`) posts to a Google Apps Script web app that appends to a private Google Sheet. It is free, has no submission cap for this volume, and lets the page show its own success and error messages.

## Setup (about 5 minutes)

1. Create a Google Sheet, for example "Invariant waitlist". Keep it private.
2. In the sheet: Extensions → Apps Script. Replace the editor contents with the script below and save.
3. Deploy → New deployment → type **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone**. (Required so the site can post without a Google sign-in. The script only appends rows; it never returns sheet data.)
4. Authorize when asked. Copy the web app URL. It looks like `https://script.google.com/macros/s/AKfy…/exec`.
5. In `site/index.html`, replace `DEPLOYMENT_ID` in the `#waitlist` form's `action` with the id from that URL, and remove the TODO comment.
6. Test from the live site with your own email. Check the row appears, then try the same email again (no duplicate row) and an invalid one (inline error).

Editing the script later: Deploy → Manage deployments → edit → Version: New version. That keeps the same URL. A "New deployment" creates a new URL.

Notifications (optional): in the script editor, set `NOTIFY` to your address to get one email per new signup. Gmail quota for consumer accounts is about 100 per day.

## Script

```js
const SHEET = "Waitlist"
const PLANS = ["team"]
const SRCS = ["plans", "nav", "ci", "patterns"] // where on the page the visitor clicked from
const NOTIFY = "" // optional: your email address for a message per signup
const MIN_FILL_MS = 3000 // faster than a person can type: a bot
const MAX_NEW_PER_HOUR = 50 // flood cap on new rows

function doPost(e) {
  const p = (e && e.parameter) || {}
  // Honeypot filled: a bot. Report success so it learns nothing.
  if (p._gotcha) return json({ ok: true })
  // Time trap: the page sends its load time in t. Missing, future or too-fast is a bot.
  const age = Date.now() - Number(p.t)
  if (!(age >= MIN_FILL_MS)) return json({ ok: true })

  const email = String(p.email || "").trim().toLowerCase()
  const plan = PLANS.includes(p.plan) ? p.plan : "unknown"
  const src = SRCS.includes(p.src) ? p.src : "unknown"
  // Leading = + - @ would be read as a spreadsheet formula.
  if (email.length > 254 || /^[=+\-@]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ ok: false, error: "invalid-email" })

  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet()
    const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET)
    if (sh.getLastRow() === 0) sh.appendRow(["joined_at", "email", "plan", "src"])
    const rows = sh.getLastRow() - 1
    const known = rows > 0 ? sh.getRange(2, 2, rows, 1).getValues().flat() : []
    if (!known.includes(email)) {
      const cache = CacheService.getScriptCache()
      const n = Number(cache.get("new") || 0)
      if (n >= MAX_NEW_PER_HOUR) return json({ ok: false, error: "busy" })
      cache.put("new", String(n + 1), 3600)
      sh.appendRow([new Date(), email, plan, src])
      if (NOTIFY) MailApp.sendEmail(NOTIFY, "Invariant waitlist: " + plan, email)
    }
  } finally {
    lock.releaseLock()
  }
  // A repeat signup also gets ok, so the form does not reveal who is already on the list.
  return json({ ok: true })
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}
```

## Behavior and limits

- Column `src` records which link led to the form (`nav`, `ci`, `patterns`, or `plans` for a direct visit). When adding it to an existing sheet, type `src` in cell D1 yourself; the script only writes the header into an empty sheet.

- The page posts `application/x-www-form-urlencoded`, which needs no CORS preflight. Apps Script responses can be read cross-origin, so the page shows "You're on the list" or an inline error.
- Duplicates: the same email (case-insensitive) is stored once and still gets `ok`.
- Spam protection: honeypot field, a time trap (submissions under 3 seconds after page load are dropped silently, as are posts with no `t`), the email format check, and a cap of 50 new rows per hour. A bot that mimics the form and waits 3 seconds still gets through, up to the cap. If that happens, move to a service with CAPTCHA.
- Because the time trap needs the page's JavaScript, the no-JavaScript fallback post is silently dropped.
- The sheet holds personal data (emails). Share it with no one who does not need it, and delete it if the waitlist is abandoned. The page promises the email is used only to announce Team.
