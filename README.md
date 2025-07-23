# Trackly

Trackly is a database for conveniently storing and searching for tracks. While creating it, I was addressing my own problem: I have a multitude of tracks from various hikes, trips, and runs. However, there wasn't a sufficiently convenient place to view, search, and store them. For a long time, the tracks were stored on Google Drive, but that's incredibly inconvenient — searching for them, uploading them somewhere just to take a look.

Dead simple, solving a narrow set of tasks — storing, searching, filtering, viewing, and sharing tracks. At the current step, it's not a goal to make an editor! Might be later.

I searched for and tried numerous services, and none of them suited me for one or more reasons:

- [ttrails.ru](https://ttrails.ru/treks/map) — the UX is lacking
- [Wikiloc](https://www.wikiloc.com) — feature-rich, but overcomplicated
- [GPSLib](http://www.gpslib.ru/) — terribly outdated, looks like a grandfather's car from the 90s
- [MapMagic](https://mapmagic.app/) — good, but... the current pricing raises questions; it seems too expensive for the value offered
- [BRouter](https://brouter.de/brouter-web/) — good for route planning, but not for storing them
- [Velocat](https://velocat.ru/velo/phpBB3/map.php) — the UX is also lacking, although the database of tracks is large
- [Nakarte](https://nakarte.me/) — an excellent service, I often use it for creating and viewing tracks… but it stores data in the browser's local storage, which is not suitable for reliable storage
- [GPX Studio](https://gpx.studio/) — a convenient service for viewing and editing tracks, but not suitable for storage

So I created my own one.

---

## Monorepo Structure

- `backend/`   — Rust (Axum) backend
- `frontend/`  — Vue 3 + Vite frontend
- `docker-compose.dev.yaml` for development
- `docker-compose.aarch64.prod.yaml` for production on ARM64 architecture
- `docker-compose.x86_64.prod.yaml` for production on x86_64 architecture
- `Dockerfile.backend`
- `Dockerfile.frontend`

---

## Backend (Axum)
- REST API for tracks
- Parses GPX/KML, stores geometry & metadata in PostgreSQL (PostGIS)
- No file storage, only extracted data
- Deduplication by geometry hash
- Export to GPX

## Frontend (Vue + Leaflet)
- Map with tracks, filters (category, length)
- Upload, edit, delete (session), export
- English only

## Database
- PostgreSQL + PostGIS

---

## To Start

### Development
- Use `docker-compose -f docker-compose.dev.yaml up --build`

### Production
- Use `docker-compose -f docker-compose.<target-arch>.prod.yaml up --build`
- Where `<target-arch>` is either `aarch64` or `amd64`

### Docker Images
Pre-built Docker images are available from:
- **GitHub Container Registry**: `ghcr.io/like-a-freedom/trackly-backend` and `ghcr.io/like-a-freedom/trackly-frontend`

---

## CI/CD

The project uses GitHub Actions for automated building and testing:
- **Test workflow**: Runs on every push and PR, tests both backend and frontend
- **Build workflow**: Builds and publishes Docker images on releases and pushes to main branch
- **Multi-architecture support**: Images are built for both `linux/amd64` and `linux/arm64`
