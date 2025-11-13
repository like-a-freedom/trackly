<div align="center">

# 🗺️ Trackly

**Dead simple track storage and visualization**

Store, search, filter, view and share your GPS tracks without the bloat

[![License](https://img.shields.io/github/license/like-a-freedom/trackly)](LICENSE)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/like-a-freedom/trackly/pkgs/container/trackly-backend)
[![Built with Rust](https://img.shields.io/badge/built_with-Rust-orange.svg)](https://www.rust-lang.org/)
[![Built with Vue](https://img.shields.io/badge/built_with-Vue.js-4FC08D.svg)](https://vuejs.org/)

[View screenshots](#-screenshots) · [Report Bug](https://github.com/like-a-freedom/trackly/issues) · [Request Feature](https://github.com/like-a-freedom/trackly/issues)

</div>

---

## 📋 Table of Contents

- [About](#-about)
- [Key Features](#-key-features)
- [Screenshots](#-screenshots)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development](#development)
  - [Production](#production)
- [Architecture](#-architecture)
- [Adaptive Simplification](#adaptive-simplification)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Contact](#-contact)

---

## 💡 About

Trackly solves a simple but frustrating problem: **where do you store hundreds of GPS tracks from hikes, bike rides, and runs in a way that's actually convenient?**

### The Problem
Originally, I had tracks scattered across Google Drive — impossible to search, preview, or organize. Every time I wanted to view one, I'd have to download it and open it in yet another app. After that, I tried a dozen online services, but none focused on the core need of **easy storage and viewing with advanced filtration** without unnecessary complexity or bloat.

### What I Tried
I tested every GPS track service I could find:

- **ttrails.ru** — poor UX
- **Wikiloc** — overcomplicated for simple storage
- **GPSLib** — outdated interface from the 90s
- **MapMagic** — overpriced for what it offers
- **BRouter** — great for planning, not storage
- **Velocat** — clunky UX despite large database
- **Nakarte** — excellent but stores in browser (unreliable)
- **GPX Studio** — good viewer, not a storage solution

### The Solution
Trackly is laser-focused on doing one thing well: **storing, viewing and advanced filtration over hundreds of tracks with zero friction.** Why? I'm an outdoor enthusiast that love to hike, trek and trailrunning, and I constantly facing the very specific problem: which tracks are perfectly suited for my next adventure in terms of distance, elevation and slope? None of the existing solutions addressed this core need without unnecessary bloat, so I built Trackly.

- 🎯 **Dead simple** — Upload GPX, view on map, search, filter, done
- 🚫 **No bloat** — Not trying to be Strava, Komoot, or a social network
- 🔒 **Your data** — Self-hosted, full control
- ⚡ **Fast** — Adaptive simplification keeps huge tracks smooth

---

## ✨ Key Features

### Core Functionality
- 📤 **Supporting GPX format only** — Focused on the most widely used GPS track format for now
- 🗺️ **Interactive maps** — View tracks on OpenStreetMap (Leaflet)
- 🔍 **Smart filtering** — Filter by category, length, elevation, slope
- 🔗 **Easy sharing** — Export to GPX or share map links
- 🔐 **Session-based ownership** — Edit and delete your own tracks

### Technical Excellence
- ⚡ **Adaptive simplification** — Huge tracks load instantly without losing much detail
- 🎯 **Deduplication** — Geometry-based hash prevents duplicates
- 📊 **Rich metadata** — Elevation, heart rate, temperature, cadence, speed, pace
- 🌍 **Geospatial storage** — PostGIS for proper spatial queries
- 🚀 **On-the-fly optimization** — Dynamic simplification based on zoom level
- 📍 **POI support** — Points of interest with deduplication

---

## 📸 Screenshots

> **Note:** Add screenshots of your deployed instance here showing:
> - Main map view with multiple tracks
> - Track detail view with elevation profile
> - Upload interface
> - Filter/search functionality

---

## 🛠️ Tech Stack

<div align="center">

### Frontend
![Vue.js](https://img.shields.io/badge/Vue.js-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)

### Backend
![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)
![Axum](https://img.shields.io/badge/Axum-000000?style=for-the-badge&logo=rust&logoColor=white)

### Database
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-336791?style=for-the-badge&logo=postgresql&logoColor=white)

### Infrastructure
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Caddy](https://img.shields.io/badge/Caddy-1F88C0?style=for-the-badge&logo=caddy&logoColor=white)

</div>

<details>
<summary><b>📦 Component Details</b></summary>

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | Vue 3 + Vite | Reactive UI with fast HMR |
| **Map Rendering** | Leaflet | Interactive OpenStreetMap visualization |
| **API Framework** | Axum (Rust) | Fast, type-safe REST API |
| **Database** | PostgreSQL 17+ | Reliable data storage |
| **Spatial Extension** | PostGIS | Geospatial queries and operations |
| **Reverse Proxy** | Caddy | Auto HTTPS and routing |
| **Containerization** | Docker Compose | Easy deployment and scaling |
| **File Parsing** | gpx (Rust) | GPX/KML/FIT parsing |
| **Database Client** | SQLx | Compile-time checked queries |

</details>

---

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have installed:

- **Docker** (20.10+) and **Docker Compose** (2.0+)
- **Git** for cloning the repository

That's it! Docker handles everything else.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/like-a-freedom/trackly.git
   cd trackly
   ```

2. **Set up environment variables** (optional)
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

### Development

Start the development environment with hot-reload:

```bash
docker-compose -f docker-compose.dev.yaml up --build
```

**Access the application:**
- 🌐 Frontend: http://localhost:81
- 🔧 Backend API: http://localhost:8080
- 🗄️ PostgreSQL: localhost:5432

### Production

Choose the appropriate compose file for your architecture:

**For ARM64 (Apple Silicon, ARM servers):**
```bash
docker-compose -f docker-compose.aarch64.prod.yaml up -d
```

**For AMD64 (Intel/AMD x86_64):**
```bash
docker-compose -f docker-compose.amd64.prod.yaml up -d
```

**Using pre-built images:**

Images are automatically published to GitHub Container Registry:
```bash
# Pull images
docker pull ghcr.io/like-a-freedom/trackly-backend:latest
docker pull ghcr.io/like-a-freedom/trackly-frontend:latest
```

### Quick Test

After starting, test the installation:

```bash
# Health check
curl http://localhost:8080/health

# Expected response: {"status":"ok"}
```

---

## 🏗️ Architecture

### Monorepo Structure

```
trackly/
├── backend/          # Rust (Axum) REST API
├── frontend/         # Vue 3 + Vite SPA
├── db_data/          # PostgreSQL data volume
├── docs/             # Technical specifications
├── migrations/       # Database schema migrations
└── docker-compose.*  # Deployment configurations
```

### Backend (Rust + Axum)

**Core Responsibilities:**
- RESTful API for track CRUD operations
- Parse GPX/KML/FIT files and extract geometry + metadata
- Store only parsed data (no file storage)
- Geometry-based deduplication using spatial hashing
- Export tracks to GPX format
- Adaptive on-the-fly simplification for large datasets
- Session-based ownership enforcement

**Key Technologies:**
- `axum` — Web framework
- `sqlx` — Type-safe SQL with compile-time verification
- `gpx` — GPX/KML/FIT parsing
- `geo` — Geospatial operations
- `tokio` — Async runtime

### Frontend (Vue 3 + Leaflet)

**Core Responsibilities:**
- Interactive map with track visualization
- Filter UI (category, length, elevation, slope)
- Upload, edit, delete, export workflows
- Session management for ownership
- Responsive design

**Key Technologies:**
- `Vue 3` — Reactive framework (Composition API)
- `Vite` — Build tool with HMR
- `Leaflet` — Map rendering
- `Axios` — HTTP client

### Database (PostgreSQL + PostGIS)

**Schema Highlights:**
- `tracks` — Main track metadata and geometry
- `track_points` — Individual GPS points with elevation/HR/temp/cadence
- `pois` — Points of interest with deduplication
- Spatial indexes for fast queries
- Geometry hash column for deduplication

**Migrations:**
All schema changes are versioned with SQLx migrations in `backend/migrations/`.

---

## ⚡ Adaptive Simplification

Trackly uses intelligent simplification to keep the UI responsive even with tracks containing 50,000+ points.

### How It Works

**Only responses are simplified** — original data remains intact in the database.

**Two-tier approach:**
1. **Geometry simplification** — Douglas-Peucker algorithm with zoom-aware tolerance
2. **Profile downsampling** — Elevation/HR/temperature/time arrays match simplified geometry

### Simplification Buckets

| Points Range | Tolerance Scale* | Behavior |
|--------------|------------------|----------|
| 0 – 1,000 | None | ✅ Return original (no simplification) |
| 1,001 – 5,000 | 0.5× base | 🟢 Mild simplification |
| 5,001 – 20,000 | 1.0× base | 🟡 Base simplification + 33% retention guard |
| 20,001 – 50,000 | 1.5× base | 🟠 Strong simplification |
| 50,000+ | 2.5× base | 🔴 Aggressive simplification |

**Base tolerance depends on zoom level:**
- World view (zoom 0-8): 1000m tolerance
- Regional view (zoom 9-13): 100m tolerance  
- City view (zoom 14-16): 10m tolerance
- Max detail (zoom 17+): 5m tolerance

### Retention Guard

For moderately sized tracks (5,001–20,000 points), a **minimum retention rate of ~33%** prevents over-collapse. This preserves detail in tracks that are mostly linear but have important nuances.

**Example:**
- Original: 10,000 points
- Douglas-Peucker reduction: Would drop to 1,500 points
- Guard enforcement: Returns at least 3,333 points
- Result: ✅ Smooth rendering + preserved detail

### Benefits

✅ **Fast loading** — Even 100k point tracks load instantly  
✅ **Preserved fidelity** — Small tracks never simplified  
✅ **Smart balancing** — Retention guard prevents detail loss  
✅ **Zoom-aware** — More detail at higher zoom levels  
✅ **Original data safe** — Simplification only affects API responses

---

## 🗺️ Roadmap

TBD

See the [open issues](https://github.com/like-a-freedom/trackly/issues) for feature requests and known issues.

---

## 🤝 Contributing

Contributions are what make open source amazing! Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow SOLID principles and DRY practices
- Use Test-Driven Development (TDD) where applicable
- Run tests before submitting PR: `cargo test` (backend), `npm test` (frontend)
- Update documentation for new features
- Keep PRs focused and small

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 📬 Contact

**Project Maintainer:** [@like-a-freedom](https://github.com/like-a-freedom)

**Project Link:** [https://github.com/like-a-freedom/trackly](https://github.com/like-a-freedom/trackly)

**Issues & Feature Requests:** [GitHub Issues](https://github.com/like-a-freedom/trackly/issues)

---

## 🙏 Acknowledgments

- [OpenStreetMap](https://www.openstreetmap.org/) — Map tiles and data
- [Leaflet](https://leafletjs.com/) — Excellent mapping library
- [Rust Community](https://www.rust-lang.org/community) — Support and libraries
- [Vue.js Team](https://vuejs.org/) — Fantastic framework
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — README structure inspiration

---

## 🔗 CI/CD

The project uses **GitHub Actions** for automated testing and deployment:

- 🐳 **Build workflow** — Publishes Docker images on releases
- 🏗️ **Multi-arch support** — Both `linux/amd64` and `linux/arm64`

---

<div align="center">

Made with ❤️ for outdoor enthusiasts

[⬆ back to top](#-trackly)

</div>
