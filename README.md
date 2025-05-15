# Trackly Monorepo Structure

- backend/   # Rust (Axum) backend
- frontend/  # Vue 3 + Vite frontend
- docker-compose.yml
- Dockerfile.backend
- Dockerfile.frontend

---

## Backend (Axum)
- REST API for tracks
- Parses GPX/KML, stores geometry & metadata in PostgreSQL (PostGIS)
- No file storage, only extracted data
- Deduplication by geometry hash
- Export to GPX
- 30MB upload limit

## Frontend (Vue + Leaflet)
- Map with tracks, filters (category, length)
- Upload, edit, delete (session), export
- English only

## Database
- PostgreSQL + PostGIS

---

To start:
- Place backend code in `backend/`
- Place frontend code in `frontend/`
- Use `docker-compose up --build`
