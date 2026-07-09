# GEMINI.md - GeoNode Mining & Carbon Tracking Platform

This project is a comprehensive GeoNode-based GIS platform extended with specialized modules for mining detection, carbon tracking, and CO2 management. It integrates satellite data processing, AI-assisted analysis, and operational workflows into a unified geospatial environment.

## 🚀 Project Overview

- **Base Platform:** [GeoNode](https://geonode.org/) (Django-based GIS)
- **Primary Domain:** Environmental monitoring, specifically focused on mining detection and greenhouse gas (CO2) analysis.
- **Key Modules:**
  - `mining_detection`: AI-driven analysis of raster datasets to identify mining activities.
  - `carbon_tracker`: Deep integration with OCO-2 and GOSAT-2 satellite data, handling soundings, retrieval results, and profiles.
  - `co2_management`: High-level management of CO2 datasets, satellite/instrument metadata, and comparison analysis.
  - `wind_management`: Management & analysis of meteorological, wind, and oceanographic datasets (WRF 3km, ERA5, CMEMS, station observations).

## 🏗️ Architecture & Tech Stack

The system follows a distributed architecture orchestrated via Docker Compose:

- **Web Layer:** Django 4.x, Django REST Framework (DRF).
- **GIS Engine:** GeoServer for WMS/WFS/WCS services and spatial data publishing.
- **Database:** PostgreSQL with PostGIS extension.
- **Task Queue:** Celery with Redis as the message broker for asynchronous processing (AI jobs, data imports).
- **Cache:** Memcached and Redis.
- **AI Integration:** Communication with an external AI service (typically at `http://ai_api:8001`) for specialized inference.
- **Frontend:** React SPA mounted inside Django templates (hybrid architecture), Leaflet for maps, Chart.js for analytics.

## 📂 Repository Structure

- `src/`: Core application source.
  - `geonode_project/`: Main Django project configuration and settings.
  - `mining_detection/`: Mining analysis workflow, AI service integration, and custom UI.
  - `carbon_tracker/`: Satellite data models (OCO-2, GOSAT-2) and ingestion logic.
  - `co2_management/`: Management of CO2 measurement sources and comparison jobs.
  - `wind_management/`: Wind and oceanographic data integration, gridded data index, and stations.

- `docker/`: Custom Dockerfiles for GeoServer, PostgreSQL, Nginx, etc.
- `docker-compose.yml`: Main orchestration file for development and production.
- `Dockerfile`: Main application image for the Django/Celery services.

## 🛠️ Building and Running

### Prerequisites
- Docker and Docker Compose.
- `.env` file (copied from `.env.sample` and configured).

### Key Commands
- **Start the platform:** `docker-compose up --build`
- **Run Migrations:** `docker-compose exec django python manage.py migrate`
- **Create Superuser:** `docker-compose exec django python manage.py createsuperuser`
- **Collect Statics:** `docker-compose exec django python manage.py collectstatic --noinput`
- **View Logs:** `docker-compose logs -f django` or `docker-compose logs -f celery`

### Local Development (inside container)
The `django` service uses `python manage.py runserver 0.0.0.0:8000` by default in the `docker-compose.yml` for development convenience.

## 📝 Development Guidelines

### 1. Custom App Patterns
- **Views:** Prefer Class-Based Views (CBVs) for templates and DRF ViewSets for APIs.
- **Logic:** Business logic should reside in `services.py` or `tasks.py` rather than being bloated in views.
- **Models:** Use GeoDjango `models.PointField` or `models.GeometryField` for spatial data.

### 2. Internationalization (i18n)
The project supports multiple languages:
- Vietnamese (`vi-vn`)
- English (`en-us`)
- Italian (`it-it`)
Ensure all user-facing strings are wrapped in `gettext` or `{% trans %}`.

### 3. Asynchronous Workflows
Long-running tasks (e.g., AI analysis, remote data polling, large GeoNode uploads) **must** be implemented as Celery tasks in `tasks.py`.

### 4. GeoNode Integration
- When creating results from analysis, attempt to link them back to a GeoNode `Dataset` record to ensure they are visible in the platform's standard catalogs.
- Use `alternate` as a stable identifier when matching local records to external service payloads.

### 5. UI/UX Consistency
- Inherit from `mining_detection/templates/mining_detection/app_base.html` for custom operational pages.
- Use the existing card and toolbar patterns to maintain a cohesive look.
- Project using Bootstrap 3, you can using them

## 🔍 Key Integration Points
- **AI Service:** Integration layer in `src/mining_detection/services.py`.
- **Satellite Data:** Storage and profile management in `src/carbon_tracker/models.py`.
- **GeoServer:** Automatic publishing via GeoNode's signal-based or explicit API interactions.

## 🎨 Frontend Architecture: React-Django Hybrid

The project uses a hybrid approach to modernize the UI while maintaining GeoNode's robust backend.

### 1. How it works
- **Django** handles Routing, Auth, and the main Layout.
- **React** is embedded into specific pages (e.g., Dashboards, List Views) for high interactivity.
- **Vite** builds React code into static bundles loaded by Django templates.

### 2. Project Structure
- `frontend/`: Centralized React source code (TypeScript, Vite) at the project root.
  - `src/common/`: Shared logic and components (e.g., `DataTable`, `useFetchData`).
  - `src/modules/`: Module-specific code (e.g., `co2_management/`).
- `src/<module>/static/<module>/react/`: Build output directory for each module.

### 3. Development Workflow

#### Phase A: React Development
To start developing React components with auto-rebuild:
1. Open a terminal in the `frontend` directory.
2. Run: `npx vite build --watch`
   *(This will rebuild all module bundles every time you save a file).*

#### Phase B: Syncing with Docker
Since Nginx serves files from a shared volume, you must sync the built files:
1. Run: `docker-compose exec django python manage.py collectstatic --noinput`

### 4. Key Integration Points
- **Mount Point:** Django templates use `<div id="react-root-..."></div>`.
- **API Communication:** React uses `axios` to fetch data from Django REST Framework endpoints (e.g., `/co2/api/v1/...`).

## 🔄 Core Agent Rules & Workflow

Every AI Coding Agent working on this repository MUST strictly follow the rules below without exception:

### 🛡️ Rule 1: Codebase Navigation & Discovery
- **Action Required:** Before writing or editing code, if the user request does not explicitly specify which files to modify, the agent **MUST** read the `codebase_map.md` file located inside the target app's `docs/` folder (e.g., [wind_management docs](file:///D:/Research/Geonode/geonode-project/src/wind_management/docs/codebase_map.md) or [co2_management docs](file:///D:/Research/Geonode/geonode-project/src/co2_management/docs/codebase_map.md)).
- **Goal:** Never guess file paths or randomly search directories when a codebase map is available.

### 🛡️ Rule 2: Codebase Map Maintenance
- **Action Required:** If you make changes, add, or refactor any source files, model definitions, API endpoints, views, or React components within an app, you **MUST** immediately update that app's `docs/codebase_map.md` to reflect the new structure.

### 🛡️ Rule 3: Business Logic Placement
- **Action Required:** Keep Django Views clean and lean. Business logic and heavy computations **MUST** reside in `services.py` or asynchronous Celery `tasks.py`.

### 🛡️ Rule 4: Frontend Development & Synchronisation
- **Action Required:** When modifications are made to the React frontend code inside the `frontend/` directory, the agent **MUST** run the build and collectstatic cycle:
  1. Compile assets: `npm run build` (inside the `frontend/` directory).
  2. Sync assets with Docker: `docker-compose exec django python manage.py collectstatic --noinput`.
- **Comment Policy:** Always write clear comments on complex code blocks, especially inside React state selectors or custom Django queries.

### 🛡️ Rule 5: Commit Strategy
- **Action Required:** Keep commits atomic. Before finalizing changes, write down a draft commit message matching the conventional commits standard (e.g., `feat: ...`, `fix: ...`) for user approval.
---
*This file is maintained for AI agent context. Update it when significant architectural changes occur.*

