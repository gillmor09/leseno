# Checkliste: Supabase über Coolify erreichbar machen

Stand der letzten Prüfung (lokal): `supabase-api.leseno.de` ist **nicht** erreichbar. Zwei Ursachen lagen gleichzeitig vor:

1. DNS kennt den Namen, liefert aber **keine IPv4/IPv6-Adresse**.
2. Trifft man den VPS trotzdem mit diesem Host-Header, antwortet der Proxy **503** (`no available server`) — es läuft kein Backend für diese Domain.

App-URL in `.env.local` / Coolify: `NEXT_PUBLIC_SUPABASE_URL=https://supabase-api.leseno.de`  
App-Host `leseno.de` zeigt auf denselben Server (`169.58.48.212`).

---

## 1. DNS (Domain-Registrar / DNS-Panel)

- [ ] A-Record `supabase-api.leseno.de` → dieselbe IPv4 wie `leseno.de` (`169.58.48.212`)
- [ ] Optional AAAA, **nur** wenn der Proxy IPv6 wirklich bedient (sonst weglassen)
- [ ] Kein „leerer“ Name ohne Ziel; CNAME nur auf einen Host, der selbst ein A-Record hat
- [ ] TTL kurz halten, bis es steht (z. B. 300 s)
- [ ] Warten, bis öffentlich aufgelöst wird

Prüfung (PowerShell):

```text
nslookup supabase-api.leseno.de 1.1.1.1
nslookup supabase-api.leseno.de 8.8.8.8
```

Erwartet: eine IPv4-Adresse, nicht nur der Name.

---

## 2. Coolify: Supabase-Dienst

Im Coolify-UI (auf dem Server oft Port 8000, Login — das ist **nicht** die API):

- [ ] Supabase-Stack / -Service existiert und Status ist **running** (nicht exited / unhealthy)
- [ ] Alle nötigen Container laufen: mindestens Kong (oder Traefik-Ziel), Auth (GoTrue), Rest (PostgREST), Postgres
- [ ] Keine Restart-Schleife in den Logs (Kong, Auth, Postgres)
- [ ] Postgres-Volume vorhanden, Dienst nicht nur „angelegt“ sondern deployed

---

## 3. Coolify: Domain am Proxy

- [ ] Am Supabase-**API**-Dienst (Kong / Gateway) die Domain `supabase-api.leseno.de` eingetragen — nicht an der Next.js-App
- [ ] HTTPS aktiv, Zertifikat für genau diesen Host
- [ ] Ziel-Port = öffentlicher API-Port des Stacks (Kong), nicht Postgres `5432`
- [ ] Nach DNS-Änderung Proxy neu laden bzw. Service neu starten

Erwartet nach dem Setzen: `https://supabase-api.leseno.de` antwortet nicht mehr mit 503.

---

## 4. TLS

`leseno.de` kam zuletzt mit `SEC_E_UNTRUSTED_ROOT` (Kette unvollständig oder interne CA). Dasselbe darf die API nicht tun, sonst scheitert der Browser-Client.

- [ ] Let’s Encrypt (oder gleichwertig) für `supabase-api.leseno.de`
- [ ] Volle Kette, kein selbstsigniertes Zertifikat für die öffentliche API
- [ ] Nach Ausstellung: `curl.exe -sI https://supabase-api.leseno.de/auth/v1/health` **ohne** `-k`

---

## 5. Env in Coolify und lokal

Werte nicht committen. In Coolify bei der **Leseno-App** und in `.env.local`:

- [ ] `NEXT_PUBLIC_SUPABASE_URL=https://supabase-api.leseno.de` (genau diese öffentliche URL)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon / publishable key aus dem Supabase-Stack
- [ ] `SUPABASE_SERVICE_ROLE_KEY` nur serverseitig
- [ ] Stripe: siehe [docs/stripe.md](stripe.md) (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`)
- [ ] Optional Analytics: `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-…` (Google Analytics 4)
- [ ] Nach Key-Rotation App neu deployen

---

## 6. Postgres von außen (optional)

Port `5432` auf dem VPS war von hier **nicht** erreichbar (Timeout). Für die App reicht die HTTPS-API.

- [ ] App und Migrationen über die API bzw. ein internes Netz — `5432` nicht öffentlich öffnen, außer bewusst mit Firewall-Allowlist
- [ ] `DATABASE_URL` nur für lokale/Admin-Skripte, Passwort-Sonderzeichen URL-encoden (z. B. `#` → `%23`)

---

## 7. Fertig, wenn das gilt

Im Projektordner (ohne Secrets in die Konsole zu kopieren):

```text
nslookup supabase-api.leseno.de 1.1.1.1
curl.exe -sS -I --max-time 15 https://supabase-api.leseno.de/auth/v1/health
curl.exe -sS -I --max-time 15 -H "apikey: DEIN_ANON_KEY" -H "Authorization: Bearer DEIN_ANON_KEY" https://supabase-api.leseno.de/rest/v1/
```

- [ ] DNS liefert eine IP
- [ ] `/auth/v1/health` → **200** (oder klarer Health-JSON), TLS ohne Warnung
- [ ] `/rest/v1/` mit Anon-Key → **200** oder leere Liste, **nicht** 401/503 wegen downem Gateway
- [ ] Dev-Server neu starten, nachdem `.env.local` stimmt

---

## Reihenfolge

1. DNS-A-Record setzen und warten, bis er auflöst  
2. Supabase-Stack in Coolify auf **running** bringen  
3. Domain `supabase-api.leseno.de` am API-Proxy hängen + TLS  
4. Keys in der App-Env prüfen  
5. Die drei Befehle aus Abschnitt 7
