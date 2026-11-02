# Deployment guide (Stage 10B)

Layout: **Neon** (PostgreSQL) + **Render** (API web service) + **Vercel** (React client).
The browser only talks to the Vercel address. Vercel forwards `/api/*` to Render, so the session cookie stays on one
domain (`SameSite=Lax`, no CSRF exposure, no `VITE_API_URL`, no CORS trouble).

Do the steps in this order. The API address is needed before the client can be configured.

## 1. Database on Neon
1. Create a project (region close to Render's, for example Singapore if you pick it for Render).
2. Copy the **direct** connection string (host WITHOUT `-pooler`). Prisma migrations need it. It ends with `?sslmode=require`.
3. Keep it secret. Never paste it into git, chat or the README.

## 2. Seed the database once (from your laptop, PowerShell)
```powershell
cd <your project folder>\server
$env:DATABASE_URL = "PASTE-THE-NEON-DIRECT-STRING"
npx prisma migrate deploy
node prisma/seed.js
npm run seed:check          # expect DEMO NUMBERS OK
Remove-Item Env:DATABASE_URL
```
Close that PowerShell window afterwards. While the variable is set, every command (including `npm test`) runs against Neon.

## 3. API on Render
New > Web Service > connect the GitHub repo, branch `main` (demo only runs from `main`).

| Setting | Value |
| --- | --- |
| Root Directory | `server` |
| Runtime | Node |
| Build Command | `npm ci && npx prisma generate && npx prisma migrate deploy` |
| Start Command | `node src/server.js` |
| Instance type | Free |
| Health Check Path | `/api/health` |

Environment variables (names only here; set the values in Render):

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Neon direct string |
| `JWT_SECRET` | a random value of 32+ characters (generate below) |
| `JWT_EXPIRES_IN` | `1h` |
| `API_PORT` | `10000` (Render's default port) |
| `CLIENT_ORIGIN` | the Vercel address, for example `https://sih26262.vercel.app` (set it after step 4, then redeploy) |
| `TRUST_PROXY` | `2` (Vercel, then Render's proxy; verified in step 6) |
| `COOKIE_SAMESITE` | `lax` |
| `MAIL_MODE` | `preview` (emails are shown on the Email preview screen; use `smtp` only with real SMTP values) |
| `MAIL_FROM` | `alerts@sih26262.test` |
| `SMS_PROVIDER` | `stub` |
| `UPLOAD_DIR` | `./uploads` |
| `TZ` | `UTC` |
| `DISABLE_CRON` | `false` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | only if `MAIL_MODE=smtp` (Mailtrap) |

Generate the secret in PowerShell:
```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```
If the service refuses to start, read the Render log: `checkConfig` prints exactly which setting is unsafe.
Check: open `https://YOUR-API.onrender.com/api/health`. Expect `{"data":{"status":"ok"}}`.

## 4. Client on Vercel
1. Put `vercel.json` in `client/` and replace `REPLACE-WITH-YOUR-API-HOST` with your Render host. Commit and push to `main`.
2. Vercel: Add New > Project > the repo. Root Directory `client`, Framework Preset Vite, Build `npm run build`, Output `dist`.
3. Add NO environment variables (leave `VITE_API_URL` unset, so the client uses `/api`).
4. Copy the Vercel address into Render's `CLIENT_ORIGIN` and redeploy the API.

## 5. Keep it awake and run the daily job
Render's free service sleeps after about 15 minutes without traffic, and a sleeping service does not run `node-cron`.
1. UptimeRobot (free): new HTTP monitor on `https://YOUR-API.onrender.com/api/health`, every 5 minutes.
2. The 06:00 IST job then runs inside the web service. It can still miss a day if Render restarts, so the demo uses the
   head-office button "Run daily check now" (sidebar "Daily check") and never depends on the cron.
3. Free plan note: one always-on service uses about 744 of the 750 free hours a month. Do not run a second service.

## 6. Smoke test (laptop AND phone on mobile data)
Use the Vercel address. Passwords are `Demo@1234`.

| Check | Expect |
| --- | --- |
| `officer1@demo.test` | lands on the officer home with files due today |
| `supervisor1@demo.test` | team cards and escalations |
| `head1@demo.test` | cards read 128 / 14 / 6 / 2 on a fresh seed; Settings, Email preview and Daily check are in the menu |
| `institution1@demo.test` | applications, promises and documents expiring |
| Browser DevTools > Application > Cookies | `token` is HttpOnly, Secure, SameSite Lax |
| Log out, press Back | the app returns to the login screen |
| Head office: Daily check > run for today | alerts appear in the bell and on the Email preview screen |
| Upload a PDF proof as the institution | the officer can open and accept it |

Rate-limit check (proves `TRUST_PROXY` is right). From PowerShell, using an unknown email so no real account locks:
```powershell
$u = "https://YOUR-APP.vercel.app"
1..22 | ForEach-Object { try { (Invoke-WebRequest -Uri "$u/api/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"nobody@demo.test","password":"x"}' -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }
```
Expect 401 twenty times, then 429. Now log in as `officer1@demo.test` from the phone on mobile data. It must work.
If the phone also gets 429, all visitors share one limit: change `TRUST_PROXY` (try `1` or `3`) and redeploy.
Redeploying resets the limiter.

## 7. Before the demo
1. The evening before and again on the morning of the demo, re-seed so the dates are fresh (the "due this week" count depends on the seed day):
   ```powershell
   cd <your project folder>\server
   $env:DATABASE_URL = "PASTE-THE-NEON-DIRECT-STRING"
   npx prisma migrate reset --force
   npm run seed:check
   Remove-Item Env:DATABASE_URL
   ```
2. Open the Vercel address five minutes before you start, so Render and Neon are awake.
3. Never run `npm run seed:load` against Neon (it refuses in production, and would break the demo numbers).
4. Uploaded files live on Render's temporary disk. They disappear on a restart or redeploy. Upload the proof during the demo, not before.

## 8. Local fallback (laptop plus phone hotspot)
```powershell
cd <your project folder>\server
npm run reset
npm run seed:check          # expect DEMO NUMBERS OK
npm run dev                 # leave running
# new window
cd ..\client
npm run dev                 # open http://localhost:5173
```
Rehearse the demo once on the local copy. Run `npm run reset` again just before the demo.
Mail stays in preview mode locally (`MAIL_MODE=preview` in `.env`), so no network is needed.

## 9. After the event
Rotate `JWT_SECRET`, delete the Neon project (or reset its password), and remove the demo accounts if the link stays online.
