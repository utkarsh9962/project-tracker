---
name: daily-jira-sync
description: Daily Jira scan for the Project Tracker. Finds tickets outside ZST that the tracked people were assigned or updated, and tickets they created, since the last weekday run; records when each was assigned, when work started, and which ZST support tickets and RM releases each is linked to; and produces a CSV for the tracker's Import from Jira page. Use when asked to run the daily Jira sync or to prepare the daily tracker import.
---

# Daily Jira sync for the Project Tracker

Produce one CSV that the tracker's **Import from Jira** page can apply. It covers work outside ZST: what the
tracked people were assigned or worked on, and what they created, since the previous weekday run.

Jira is read only. Never create, edit, comment on or transition a Jira issue.

## Inputs

- **The roster**: the tracked people, as `Name<TAB>Jira accountId` lines. A scheduled run passes it in its
  prompt. Someone can have more than one account; every accountId counts. Names must be written exactly as in
  the tracker, because the import matches people by name.
  When run by hand without a roster, ask for one, or for the tracker's People export (Excel). For an export, look
  up each name once with the Atlassian `lookupJiraAccountId` operation.
- **Jira site**: `quicketsolutions.atlassian.net`, used as the cloudId on every Atlassian call.

## 1. Work out the window

Runs are on weekdays around midday IST. Cover everything since the previous run:

- Monday: `-72h` (since Friday's run)
- Tuesday to Friday: `-24h`
- A different window only when the person asks for one.

## 2. Find the tickets

Use `searchJiraIssuesUsingJql` with `view: "full"` and these fields:
`summary, status, priority, assignee, creator, created, statuscategorychangedate, issuelinks, changelog`.
Page with `nextPageToken` until there are no more pages. The responses are large: when one is saved to a file,
read it with `jq` or Python rather than in the conversation, and read all of it.

Run two searches, putting the roster's accountIds in `(…)`:

1. Assigned to a tracked person and changed in the window:
   `project not in (ZST, RM) AND assignee in (…) AND updated >= -24h`
2. Created by a tracked person in the window, whoever it is assigned to:
   `project not in (ZST, RM) AND creator in (…) AND created >= -24h`

Merge them by key. ZST tickets are tracked another way, and RM tickets are releases, not work, so neither gets
a row of its own. Both still appear in the **Linked** column (step 3).

## 3. Build one row per ticket

| Column | How to fill it |
|---|---|
| Key | The issue key. |
| Summary | `summary`, trimmed. |
| Status | The Jira status name, as it is (e.g. `Ready for Testing`). The tracker maps it. |
| Priority | The Jira priority name (e.g. `Major`). |
| Assignee | The roster name for the Jira assignee. If the assignee isn't on the roster (or there is none) but the creator is, the creator's roster name. Otherwise empty. |
| Assigned on | `YYYY-MM-DD`: the `created` date of the **last** changelog item with `field == "assignee"` whose `to` is the assignee's accountId. If there is no such item and the changelog is complete (`total <= len(histories)`), the ticket was assigned when it was made: use `created`. If the changelog is incomplete, leave it **empty**. Never guess. Leave it empty too when the Assignee column holds the creator, not the assignee. |
| Started on | `YYYY-MM-DD` from `statuscategorychangedate`: the day it moved into its current kind of status, e.g. In Progress. |
| Linked | Every key in `issuelinks` (`inwardIssue` and `outwardIssue`) whose project is ZST or RM, sorted and separated by `, `. RM tickets are releases ("Scheduled Release on 1 Dec"), usually linked with "implements". ZST tickets are the support tickets the work is for, usually "relates to". |

Take dates as the date part of Jira's timestamp, as given. Don't convert time zones.

Write the CSV with exactly this header, quoting fields that contain commas:

```
Key,Summary,Status,Priority,Assignee,Assigned on,Started on,Linked
```

Name it `tracker-jira-sync-YYYY-MM-DD.csv` (today's date in IST) and save it in the scratchpad directory.
**Never commit it or any Jira data to the repository.** The repository is public.

## 4. Check before sending

- Every row has a Key and Summary, and no key appears twice.
- Count the rows by person, and list roster people with no rows.
- Count the tickets that moved to Done or Ready for Testing in the window, the tickets created in the window, and
  the tickets that have ZST or RM links.
- Note how many rows have an empty Assigned on and why: incomplete history, or no tracked assignee.

## 5. Deliver

Send the CSV with `SendUserFile` (status `proactive`, display `attach`). Then reply with a short summary:

- the window covered;
- the totals from step 4, and the people with no activity;
- the new tickets, by person;
- anything notable, e.g. tickets now linked to an RM release with its date from the RM summary, or tickets
  assigned to someone who isn't on the roster.

End with these import notes:

1. Open the tracker and **reload it** first, so the newest importer is running. Then open **Import from Jira**
   and choose the file. The "Columns used" line should list Assigned on, In progress since and Linked tickets.
2. This file only covers one day, so the preview will list many tickets under "open here, not in the file".
   **Leave those unticked.** Ticking one marks it resolved.
3. The Linked column needs `supabase/migrations/20261126120000_ticket_links.sql`, and the dates need
   `20261126000000_ticket_dates.sql`. Both have to be run once in the Supabase SQL Editor. If one hasn't been
   run, the import says which.
