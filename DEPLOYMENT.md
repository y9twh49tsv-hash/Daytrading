# Deployment

Drei Bausteine: **Supabase** (Datenbank + Auth), **Vercel** (Dashboard), **Railway** (Worker).

## 1. Supabase

1. Neues Projekt auf <https://supabase.com> anlegen.
2. Migrationen ausführen:

   ```bash
   npx supabase login
   npx supabase link --project-ref <PROJECT_REF>
   npx supabase db push
   ```

   Alternativ beide Dateien aus `supabase/migrations/` nacheinander im SQL-Editor ausführen.

3. Unter **Authentication → Providers** E-Mail/Passwort aktivieren.
   Für lokale Tests kann „Confirm email“ deaktiviert werden.
4. Notiere dir unter **Settings → API**:
   - Project URL (`SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`)
   - `anon`-Key (Dashboard)
   - `service_role`-Key (nur Worker — niemals ins Frontend!)

## 2. Railway (Worker)

1. Neues Projekt → **Deploy from GitHub repo** → dieses Repository wählen.
2. Als Root das Repo lassen; Railway nutzt `apps/worker/railway.json`
   (Dockerfile-Build über `apps/worker/Dockerfile`).
3. **Variables** setzen (siehe `apps/worker/.env.example`):

   ```
   SUPABASE_URL=…
   SUPABASE_SERVICE_ROLE_KEY=…
   BINANCE_API_KEY=…            # Testnet-Key, optional bei reinem Paper-Trading
   BINANCE_API_SECRET=…
   BINANCE_BASE_URL=https://testnet.binance.vision
   BINANCE_WS_URL=wss://stream.testnet.binance.vision
   PAPER_TRADING=true
   KILL_SWITCH=false
   LOG_LEVEL=info
   WORKER_INSTANCE_ID=railway-1
   ```

   `PORT` setzt Railway automatisch.

4. Health-Check ist auf `/health` konfiguriert; der Prozess läuft 24/7
   (`restartPolicyType: ON_FAILURE`).
5. **IP-Allowlisting (empfohlen):** Railway → Service → Settings → Networking →
   _Static Outbound IP_ aktivieren und diese IP im Binance-API-Key-Management als
   einzige erlaubte IP hinterlegen.

## 3. Vercel (Dashboard)

1. Repo bei Vercel importieren.
2. **Root Directory:** `apps/dashboard` (Framework-Preset: Next.js).
   Vercel erkennt pnpm-Workspaces automatisch; eine `vercel.json` ist nicht erforderlich.
3. Environment Variables:

   ```
   NEXT_PUBLIC_SUPABASE_URL=…
   NEXT_PUBLIC_SUPABASE_ANON_KEY=…
   ```

   **Niemals** `SUPABASE_SERVICE_ROLE_KEY` oder Binance-Keys im Dashboard-Projekt setzen.

4. Deploy. Anschließend in Supabase unter **Authentication → URL Configuration** die
   Vercel-Domain als Site-URL/Redirect-URL eintragen.

## 4. Funktionstest

1. Dashboard öffnen → registrieren → anmelden.
2. Bot anlegen (Paper-Modus) → **Start**.
3. Railway-Logs prüfen: `worker ready`, `ws connected`.
4. `https://<railway-domain>/health` muss `"status":"ok"` liefern.
5. Im Dashboard erscheinen Heartbeat, Logs und (nach Signalen) Trades.

## Rollback / Notfall

- **Sofort-Stopp:** `KILL_SWITCH=true` in Railway setzen und neu deployen
  (blockiert jede Order-Erstellung), zusätzlich Emergency-Stop im Dashboard.
- Railway erlaubt Rollbacks auf vorherige Deployments über die Deploy-Historie.
- Vercel: „Instant Rollback“ auf das letzte funktionierende Deployment.
