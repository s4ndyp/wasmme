# WasmMe

Webbeheer voor WASM-static sites: upload een build (zip of losse bestanden), publiceer met één knop, serveer de live site op **poort 80**. De admin-UI draait op **poort 8080**.

## Snel starten (Dockhand / Docker Compose)

1. Zorg dat het image `ghcr.io/s4ndyp/wasmme:latest` bestaat (push naar `main` triggert GitHub Actions).
2. Maak het GHCR-package **public** of log in op de registry op je host.
3. Plak `docker-compose.yml` in Dockhand en start de stack.

| Poort | Doel |
|-------|------|
| **8080** | Admin: upload & publiceren |
| **80** | Gepubliceerde WASM/static site |

Persistentie: Docker volume `wasmme-data` (`staging/` en `published/`).

## Lokaal ontwikkelen

```bash
cd admin
npm install
DATA_DIR=/tmp/wasmme-data mkdir -p /tmp/wasmme-data
DATA_DIR=/tmp/wasmme-data npm start
# Admin: http://localhost:8080
```

Volledige stack lokaal (na `docker compose build`):

```bash
docker compose up -d --build
```

## API (admin)

- `GET /api/status` — staging vs gepubliceerd
- `POST /api/upload/zip` — multipart veld `archive`
- `POST /api/upload/files` — multipart veld `files` (meerdere)
- `POST /api/staging/clear`
- `POST /api/publish` — staging → live (poort 80)

## GHCR package public maken

Repo → **Packages** → `wasmme` → **Package settings** → **Change visibility** → Public (of gebruik een pull secret in Dockhand).
