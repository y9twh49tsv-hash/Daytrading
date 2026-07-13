# Bot zu Hause auf dem eigenen PC laufen lassen (Live-Trading)

Diese Anleitung startet den **Worker** auf deinem eigenen Computer in Deutschland.
Weil dein Heim-Internet eine in Deutschland zulässige IP hat, funktioniert Binance
hier — anders als bei Cloud-Servern in gesperrten Regionen (Railway: USA/NL/Singapur).

> ⚠️ **Wichtig:** Der Bot handelt nur, solange dein PC an ist und dieses Fenster
> läuft. Für echten 24/7-Betrieb bräuchtest du ein Gerät, das durchläuft
> (z. B. Raspberry Pi). Es gibt keine Gewinngarantie — du kannst dein Geld verlieren.

Dashboard und Datenbank laufen bereits (Vercel + Supabase). Es fehlt nur der Worker
auf deinem PC.

---

## 1. Programme installieren (einmalig)

1. **Node.js 22** installieren: <https://nodejs.org> → „LTS" herunterladen und installieren.
2. **Git** installieren: <https://git-scm.com/downloads>.
3. Danach ein Terminal öffnen (Windows: „PowerShell", Mac: „Terminal") und pnpm aktivieren:
   ```bash
   corepack enable
   ```

## 2. Projekt herunterladen

```bash
git clone https://github.com/y9twh49tsv-hash/Daytrading.git
cd Daytrading
pnpm install
pnpm --filter @daytrading/shared build
```

## 3. Konfiguration anlegen

Erstelle die Datei `apps/worker/.env` (im Projektordner) mit folgendem Inhalt.
Trage deine eigenen Werte ein — **diese Datei niemals weitergeben oder committen**
(sie ist bereits git-ignoriert):

```env
SUPABASE_URL=https://mmclxsfnntwrshlgfzwd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<aus Supabase: Settings → API Keys → service_role>

# Frische Binance-Mainnet-Keys (nur "Enable Spot Trading", NIE Withdrawals)
BINANCE_LIVE_API_KEY=<dein API Key>
BINANCE_LIVE_API_SECRET=<dein Secret>
BINANCE_LIVE_BASE_URL=https://api.binance.com
BINANCE_LIVE_WS_URL=wss://stream.binance.com:9443

# Live aktivieren
PAPER_TRADING=false
ALLOW_LIVE_TRADING=true
KILL_SWITCH=false

LOG_LEVEL=info
WORKER_INSTANCE_ID=home-pc
```

> Den `service_role`-Key findest du in Supabase unter **Project Settings → API Keys**.
> Er darf nur hier (im Worker) stehen, niemals im Dashboard/Browser.

## 4. Worker starten

```bash
pnpm --filter @daytrading/worker dev
```

Wenn alles passt, erscheint u. a. `worker ready`. Lass dieses Fenster offen —
solange es läuft, arbeitet der Bot.

## 5. Bot bedienen (im Dashboard)

1. Öffne dein Dashboard: <https://daytrading-dashboard-6vkq.vercel.app>
2. **Bot-Steuerung** → Bot mit Modus **Live** anlegen (z. B. Symbol `BTCUSDT`).
3. **Strategie**: setz das **Tagesverlustlimit** hoch genug (bei 12 $ sind 3 % nur
   36 Cent → Bot stoppt sofort). Für einen echten Test z. B. 50 %.
4. **Start** drücken. Der Worker auf deinem PC übernimmt und handelt.
5. Trades, Orders, Logs und Risiko siehst du live im Dashboard.

## 6. Wieder stoppen

- Im Dashboard **Stop** oder **Emergency Stop** drücken, **oder**
- das Terminal-Fenster schließen (dann öffnet der Worker keine neuen Orders mehr;
  eine offene Position bleibt bestehen, bis du sie im Dashboard schließt).

---

## Fehlerbehebung

- **`Command start failed: ... 451 restricted location`** → Binance blockiert deinen
  Standort. Auf dem Heim-PC in Deutschland sollte das nicht passieren; falls doch,
  ist evtl. ein VPN aktiv — schalte es aus (dein normales deutsches Internet ist korrekt).
- **`requires BINANCE_LIVE_API_KEY`** → Keys in `apps/worker/.env` fehlen/falsch.
- **`Invalid API-key` / Code -2015** → Key falsch kopiert, oder Spot-Trading nicht
  aktiviert, oder eine IP-Allowlist am Binance-Key blockiert deine IP.
- **Bot handelt nicht** → normal: die Strategie steigt nur bei einem EMA-Crossover
  nach Kerzenschluss ein. Das kann dauern. Prüfe die **System-Logs** im Dashboard.

## Mindestordergröße bei 12 $

Binance verlangt pro Order einen Mindestwert (je Coin ~5–10 USDT). Nimm ein Paar mit
niedrigem Minimum (z. B. BTCUSDT = 5 USDT). Nach einem Verlust kann dein Guthaben unter
das Minimum fallen — dann kann der Bot nicht weiterhandeln.
