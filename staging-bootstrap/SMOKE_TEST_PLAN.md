# Recruitera CRM — Staging Smoke-Test Plan (Day 1)

**Environment:** `staging.crm.recruitera.ai` (or whichever staging URL applies)
**Tester:** _____________  **Date:** _____________  **Build/SHA:** _____________

> Run top-to-bottom. Stop and file a P0 if any **Auth** or **Core Navigation** item fails. Everything else: log, continue, and tag the row red/green.

---

## 1. Environment sanity

- [ ] **Yellow STAGING banner visible on every page**
  *How to verify:* Open root URL → confirm a yellow bar (e.g. "STAGING — not production") is pinned to the top. Navigate to Accounts, Sales Pipeline, Settings, and a Lead Detail page. Banner must persist on all of them (no white-flash on view switch).

- [ ] **No console errors on first load**
  *How to verify:* Open DevTools console before login. Expect `[CRM] sbFetch returned ~486 accounts` (or staging row count). No red errors, no 4xx/5xx in Network tab on initial fetch.

## 2. Auth

- [ ] **Supabase magic-link login works**
  *How to verify:* Enter your @recruitera.ai email → request magic link → check inbox → click link → you land on Dashboard, signed in. Refresh the page; you stay signed in.

- [ ] **Logout clears the session**
  *How to verify:* Click your avatar → Sign out. You should be bounced to the login screen; hitting the back button must not restore the app.

## 3. Core navigation — all 9 sidebar modules

- [ ] **Each sidebar module loads without error**
  *How to verify:* Click each in order — Dashboard, Team Targeting, Reports, Accounts, Sales Pipeline, Renewal, Logs, Settings, UTM Generator. Each view must render its own header + body within ~1s. No "blank screen", no console errors. Sidebar active state should highlight the current module.

- [ ] **Sales Pipeline is the default view on first load after login**
  *How to verify:* Log in fresh → confirm board with stage columns is visible (not a 300px gap, not a blank panel).

## 4. Account detail — all 5 tabs

- [ ] **Open any account → Lead Detail page opens as an overlay**
  *How to verify:* From Accounts table or Pipeline card, click an account. Lead Detail should slide in (z-index above main view). Hero card shows avatar + name + stage pill + 7-cell stat strip.

- [ ] **All 5 tabs render: Activity, Notes, Tasks, Contacts, Contracts**
  *How to verify:* Click each tab. Each must show its own content area (even if empty state). No tab should show "undefined" or a literal `${...}` template string.

## 5. Notes + @-mentions

- [ ] **Create a note on the Notes tab**
  *How to verify:* Type into the quick note composer → Save. Note appears in the list with your name + timestamp. Refresh the page; the note persists.

- [ ] **@-mention triggers a notification pop-up for the mentioned user**
  *How to verify:* In a new note, type `@` and pick a teammate from the dropdown → Save. Have the mentioned teammate keep the CRM open in another browser/profile; a toast notification should pop up for them automatically (per recent `feat(notif)` work). Notification deep-links back to the account.

## 6. Tasks

- [ ] **Create a task from the Tasks tab**
  *How to verify:* Use the quick task composer → enter title + due date + assignee → Save. Task appears on the tab and on the **My Tasks** widget on the Dashboard (if assigned to you).

- [ ] **Toggling a task to done removes it from My Tasks widget**
  *How to verify:* On Dashboard, click the checkbox on the task you just created. It should disappear from My Tasks within ~1s (or on refresh). Re-opening the account's Tasks tab should show it as completed, not deleted.

## 7. Sales Pipeline

- [ ] **Drag a card between two non-SQL stages**
  *How to verify:* On the board, drag any card from e.g. New → Contacted. Card visually lands in the new column; refresh — it stays there. Check `stage_history` (or the Logs module) to confirm the change was recorded.

- [ ] **Dragging a card into "SQL" opens the BANT qualification modal**
  *How to verify:* Drag any non-SQL card into the SQL column. A modal with BANT (Budget / Authority / Need / Timeline) fields must appear before the move commits. Cancel → card snaps back. Fill in + confirm → card lands in SQL and BANT answers persist on the lead detail.

## 8. Settings → Team Targeting integration

- [ ] **Set a quarterly target in Settings**
  *How to verify:* Settings → Targets (or equivalent) → set a number for the current quarter for your user → Save. Expect a success toast.

- [ ] **Target shows up on Team Targeting page**
  *How to verify:* Navigate to Team Targeting. Your row must show the value you just set, with the right quarter label and the progress bar reflecting current attainment. Hard-refresh (Cmd+Shift+R) and re-check to rule out cache.

## 9. Role-based access (per recent `feat(roles)` work)

- [ ] **Module toggles in Settings actually hide sidebar items**
  *How to verify:* In Settings, disable one module (e.g. UTM Generator) for a non-admin role. Log in as a user with that role in a separate browser profile — the toggled-off module should not appear in the sidebar, and direct URL access should redirect.

---

### Sign-off

- **All green?** Tag the build "staging-day1-passed" and notify #crm-engineering.
- **Any red?** File issues with screenshots + console output, link them in the sign-off thread, and re-run the failing block after fixes land.