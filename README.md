# Railway Observatory

A backend that tracks live Indian Railways train status and explains why a train is probably running late, with the evidence attached.

Most train apps stop at "12 minutes late". Railway Observatory keeps a history of every station a train reaches, joins each delay with the weather at that station and with news reports from around the same time, and scores the likely cause. It currently tracks 12307/12308 (Jodhpur ↔ Howrah Superfast Express).

## What it does

- **Live status:** polls RailRadar and records each station a train has actually departed, never RailRadar's projected ETAs.
- **Delay history:** an append-only log of per-station visits, with the delay at each stop and the weather when it was recorded.
- **Probable cause:** matches delayed stops to news headlines and weather conditions, then outputs itemised reasons, a primary cause and a confidence tier.
- **REST API:** trains, stations, routes, runs, station visits, news events and delay attributions, documented at [`/docs`](https://railway-observatory.duckdns.org/docs).

## Run it locally

You need Docker with Compose.

```bash
cp .env.example .env
# fill in RAILRADAR_API_KEY, OPENWEATHERMAP_API_KEY and API_KEY
# point DATABASE_URL and REDIS_URL at the Compose services:
#   postgres:5432 and redis:6379
docker compose up -d --build
```

The API listens on `127.0.0.1:3000`, and the interactive API reference is at `http://127.0.0.1:3000/docs`. Migrations run automatically on start. Postgres and Redis are internal to the Compose network and have no published ports.

## How delay attribution works

The score is plain arithmetic, with no ML involved. Each delayed station visit collects reason lines from two sources:

| Signal | Score | Source |
|---|---|---|
| Rain, fog, drizzle, thunderstorm or mist at the station when the delay was observed | +2 | OpenWeatherMap |
| A matched headline naming a cause: maintenance, congestion, accident or disruption | +1 per category | Google News RSS |
| News corroboration, added only when a cause already exists | +2 if matched by train number, +1 if by station name | Google News RSS |

News is matched to a visit by train number in the headline first, then station name, within ±1 hour. Each cause category counts once, however many outlets report it.

The primary cause is the highest-scoring cause line, with ties broken in the order weather, congestion, maintenance, disruption, accident. The confidence tier follows the total: **Low** (0–1), **Medium** (2–4), **High** (5+). With no cause found, the tier is always Low.

## Data sources

| Source | Used for |
|---|---|
| [RailRadar](https://railradar.in) | Train schedules, station coordinates, live status |
| [OpenWeatherMap](https://openweathermap.org) | Weather and visibility at each station |
| Google News RSS | Incident reporting, polled hourly |

No social media or unverified passenger reports are used as a source.

## Repository

| Path | Contents |
|---|---|
| `src/adapters/` | RailRadar, OpenWeatherMap and Google News clients, with Zod-validated schemas |
| `src/jobs/` | BullMQ queues and workers: scheduler, ingestion, normalize-and-correlate, news, delay attribution |
| `src/normalize/` | Station-visit normalisation, news matching, and the attribution scoring |
| `src/routes/` | Express route handlers |
| `prisma/` | Schema and migrations |

## Contributing and contact

The project is in active development so for anything related to contributing to this project, email [mehssi2004@gmail.com](mailto:mehssi2004@gmail.com).