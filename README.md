# Project Tracker

A personal web app for keeping track of projects, deadlines, ZST support tickets, the people on each project, and the docs and links that go with them. Works on desktop and phone.

## What's in v1

- **Dashboard**: active projects with progress, open ZSTs by priority, and everything overdue or due in the next 7 days.
- **Projects**: client, status, priority, progress, start and due dates, description, tasks (with assignee and due date), team, linked ZSTs, and files/links/notes.
- **ZST tickets**: key, summary, client, project, priority, status, due/SLA date, JIRA link, notes, and files/links. Change status straight from the list.
- **People**: who's on which project and in what role.
- **Search** across projects, tasks, tickets, people and links.
- Single-password login.

Not yet: JIRA sync, Slack/email capture, spreadsheet import, file uploads, sharing.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL`, data is stored in an embedded Postgres under `./.data`, and with no `APP_PASSWORD` the login is skipped. Copy `.env.example` to `.env.local` to set either.

## Put it online (free tiers)

1. **Database:** create a project at [supabase.com](https://supabase.com). Under *Connect*, copy the **Transaction pooler** connection string.
2. **Hosting:** import this repo at [vercel.com/new](https://vercel.com/new) and add these environment variables:
   - `DATABASE_URL`: the Supabase connection string
   - `APP_PASSWORD`: the password you'll log in with
   - `SESSION_SECRET`: a long random string (`openssl rand -hex 32`)
   - `APP_TIMEZONE`: e.g. `Asia/Kolkata`
3. Deploy. Tables are created automatically on first visit.

## Tech

Next.js 16 (App Router, Server Actions), TypeScript, Tailwind CSS 4, Drizzle ORM on Postgres. Schema lives in `src/db/schema.ts`; after changing it run `npx drizzle-kit generate` to add a migration under `drizzle/`, which is applied on the next start.
