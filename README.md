# Before Your Birthday — Full Prototype

## What this prototype includes

- Mobile-first premium/mysterious visual design
- 18 pre-birthday chapters: Oct 2–Oct 19, 2026
- Birthday finale placeholder: Oct 20, 2026
- Daily unlock at exactly 10:00 PM in the visitor's local browser time
- Future chapters show as completely sealed — no title, teaser or future content
- Current/unlocked chapter appears in the timeline
- Current chapter shortcut near the top
- Two-stage reveal:
  1. chapter opens into a mysterious sealed note
  2. user taps OPEN
  3. magical confetti/particles burst
  4. story and hidden question appear
- Answers persist in the browser with localStorage
- Responsive on phones, tablets and desktop
- Content separated into content.js so stories/questions can be changed without touching the engine

## Files

- index.html — page structure
- styles.css — all visual design
- app.js — unlocking, modal, animation, answer storage
- content.js — the 18 stories/questions

## Important prototype limitation

Answers are currently saved to the visitor's browser only.

For the real deployment, this must be replaced with a private backend/database so her answers are collected for you. The UI can remain exactly the same.

## Time behavior

A chapter dated 2026-10-02 unlocks at 22:00 local browser time on Oct 2.

This is intentionally client-side for the prototype. For the production version, the server should also enforce the unlock schedule.

## How to run

Open index.html in a browser, or serve the folder with any static web server.

For local development:

python -m http.server 8000

Then open:
http://localhost:8000

## Testing future days

For development, temporarily change UNLOCK_HOUR in app.js or the date values in content.js.

Do not do this for production.

## Next production work

1. Curate and verify the 18 stories.
2. Replace placeholder questions.
3. Add private backend for answer collection.
4. Add an admin/editor interface so daily content can be changed without editing code.
5. Add birthday reveal using the collected answers.
6. Deploy to a permanent URL.


## Developer Test Mode
Use the small `TEST` button at the bottom-right, or press `Ctrl + Shift + T`. Enable the simulated clock and choose any date/time. `9:59 PM · Locked` tests the boundary immediately before unlock; `10:00 PM · Unlock` tests the exact unlock. Previous/Next Day lets you walk through Oct 2–20 quickly. Reset Saved Answers clears only prototype answer data. Return to Live Visitor Clock restores the real browser clock. Remove the test panel markup/CSS and `setupDevPanel()` before the public production release if you do not want these controls shipped.

# Production Answer Collection (Supabase)

The website can collect answers privately using Supabase. Stories/questions remain in `content.js`; answers are stored in the Supabase `birthday_answers` table.

## 1. Create the Supabase project

Create a Supabase project, then open **SQL Editor** and run `schema.sql`.

## 2. Create your admin login

In Supabase: **Authentication → Users → Add user**. Create the email/password account you will use for the private dashboard.

Then edit the final commented SQL line in `schema.sql` with that exact email and run it:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'YOUR_EMAIL@example.com'
on conflict (user_id) do nothing;
```

## 3. Configure the website

Copy `config.example.js` to `config.js` and put in:

- Supabase project URL
- Supabase **anon/publishable** key

Do **not** use a service-role key in the website.

## 4. Where answers go

The visitor submits an answer → `submit_birthday_answer()` → `birthday_answers` table.

The public visitor can submit/update her own anonymous visitor record, but cannot read the table. The private `admin.html` page can read it only after your Supabase account signs in and is present in `admin_users`.

## 5. Admin page

Open:

`/admin.html`

You can:
- sign in
- see all collected answers
- see the chapter question beside each answer
- see the latest update time
- export the archive as CSV
- sign out

## 6. Important deployment note

`config.js` contains only the public Supabase URL and anon/publishable key. That key is designed for browser use. Never put a Supabase service-role/secret key in any frontend file.

The production site should be served over HTTPS. The current developer TEST panel is still present for your private testing; remove or hide it before sending the final public link if you do not want her to see it.


## Test mode control

The public `TEST` button is hidden by default. After running the updated `schema.sql`, sign into `admin.html` and use **Developer Controls → Test mode**.

- **OFF**: public site has no TEST button and always uses the real clock.
- **ON**: public site shows the TEST button and its simulation controls.
- Changing the setting requires an authenticated admin account.
- After changing the setting, reload the public page to pick up the new setting.

Before sharing the real birthday link, leave Test mode **OFF**.
