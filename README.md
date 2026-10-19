# Project Tracker

A personal web app for keeping track of projects, deadlines, ZST support tickets, the people on each project, and the docs and links that go with them. Works on desktop and phone.

The site is hosted for free on **GitHub Pages** and keeps your data in **Supabase**. The site itself is just files; all reads and writes go straight from your browser to your Supabase database, where row-level security makes sure only your account can see or change your data.

## What's in it

- **Dashboard**: active projects with progress, open ZSTs by priority, and everything overdue or due in the next 7 days.
- **Projects**: client, status, priority, progress, start and due dates, description, tasks (with assignee and due date), team, linked ZSTs, and files/links/notes.
- **ZST tickets**: key, summary, client, project, priority, status, due/SLA date, JIRA link, notes, and files/links. Change status straight from the list.
- **People**: who's on which project and in what role.
- **Search** across projects, tasks, tickets, people and links.
- Email and password login (Supabase Auth).

Not yet: JIRA sync, Slack/email capture, spreadsheet import, file uploads, sharing.

## One-time setup

### 1. Supabase (your database and login)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/20261019000000_init.sql`](supabase/migrations/20261019000000_init.sql) and click **Run**. This creates the tables and the privacy rules.
3. Open **Authentication > Users > Add user > Create new user**. Enter your email and a password and tick **Auto Confirm User**. This is the account you'll log in with.
4. Open **Authentication > Sign In / Providers** and turn **off** "Allow new users to sign up", so nobody else can create an account.
5. Open **Project Settings > API** (or the **Connect** button) and copy the **Project URL** and the **publishable** (or `anon`) key. Both are safe to put in a public website; the privacy rules protect the data.

### 2. GitHub Pages (the website)

1. In this repo, open **Settings > Secrets and variables > Actions > Variables** and add two repository variables:
   - `VITE_SUPABASE_URL`: the Project URL
   - `VITE_SUPABASE_ANON_KEY`: the publishable/anon key
2. Open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Open **Actions > Deploy to GitHub Pages > Run workflow** (it also runs on every push to `main`).

Your tracker will be at `https://<your-username>.github.io/project-tracker/`.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL and key
npm run dev
```

To work against a throwaway local database instead (needs Docker): `npx supabase start`, then put the printed API URL and publishable key in `.env.local`. Create a login under Authentication in the local Studio at http://127.0.0.1:54323.

## Changing the database

Add a new SQL file under `supabase/migrations/` (keep the timestamp prefix so files run in order) and run it in the Supabase SQL Editor, or with `npx supabase db push` if you've linked the project.

## Tech

React 19, TypeScript, Vite, Tailwind CSS 4, React Router (hash URLs so refreshes work on GitHub Pages), TanStack Query and supabase-js.
