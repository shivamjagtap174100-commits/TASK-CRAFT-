# TaskCraft Supabase setup

The planner runs in local-only mode until Supabase is configured. Tasks, flashcards, and roadmaps created in that mode are stored in this browser and are not uploaded automatically.

## 1. Create the database tables

In your Supabase project's **SQL Editor**, run [`schema.sql`](./schema.sql). It creates the task, flashcard, and roadmap tables with row-level security policies so signed-in users can only access their own rows.

## 2. Configure the browser client

In `index.html`, replace these two constants near the start of the module script with your project's **Project URL** and **publishable key** (or legacy `anon` key):

```js
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
```

These are browser-safe project values. **Never put a service-role key or Gemini API key in the HTML.** The Supabase publishable/anon key is protected by the database's row-level security policies.

## 3. Deploy the AI function

Install the [Supabase CLI](https://supabase.com/docs/guides/cli). Run these commands from the repository root (the folder containing `index.html`), link it to your Supabase project, and set the Gemini key as a server-side secret:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_ID
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
supabase functions deploy ai-assistant
```

The function verifies the caller's Supabase session before sending an AI request. The Gemini key stays in Supabase's function secrets. The default model is `gemini-2.5-flash`; to choose a different supported model, set the `GEMINI_MODEL` function secret before deploying.

## 4. Enable accounts

In Supabase **Authentication → Providers**, enable Email. Choose whether to require email confirmation in **Authentication → URL Configuration** and the project's auth settings. Open `index.html` through a local web server or hosted HTTPS page, then sign up or sign in. Once signed in, the app loads and saves your account's cloud data.

When the app is hosted on GitHub Pages, set the Supabase **Site URL** to your Pages address and add that address to the allowed **Redirect URLs**. For local development, allow `http://localhost:8000`.

The app intentionally does not merge browser-local records into a cloud account automatically. This avoids silently mixing data between accounts. Copy any local-only records you want to keep into the signed-in workspace.
