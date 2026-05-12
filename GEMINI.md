# GEMINI.md - GeoNode Mining & Carbon Tracking Platform

This project is a comprehensive GeoNode-based GIS platform extended with specialized modules for mining detection, carbon tracking, and CO2 management. It integrates satellite data processing, AI-assisted analysis, and operational workflows into a unified geospatial environment.

## 🚀 Project Overview

- **Base Platform:** [GeoNode](https://geonode.org/) (Django-based GIS)
- **Primary Domain:** Environmental monitoring, specifically focused on mining detection and greenhouse gas (CO2) analysis.
- **Key Modules:**
  - `mining_detection`: AI-driven analysis of raster datasets to identify mining activities.
  - `carbon_tracker`: Deep integration with OCO-2 and GOSAT-2 satellite data, handling soundings, retrieval results, and profiles.
  - `co2_management`: High-level management of CO2 datasets, satellite/instrument metadata, and comparison analysis.

## 🏗️ Architecture & Tech Stack

The system follows a distributed architecture orchestrated via Docker Compose:

- **Web Layer:** Django 4.x, Django REST Framework (DRF).
- **GIS Engine:** GeoServer for WMS/WFS/WCS services and spatial data publishing.
- **Database:** PostgreSQL with PostGIS extension.
- **Task Queue:** Celery with Redis as the message broker for asynchronous processing (AI jobs, data imports).
- **Cache:** Memcached and Redis.
- **AI Integration:** Communication with an external AI service (typically at `http://ai_api:8001`) for specialized inference.
- **Frontend:** Server-rendered Django templates, Leaflet for maps, Chart.js for analytics.

## 📂 Repository Structure

- `src/`: Core application source.
  - `geonode_project/`: Main Django project configuration and settings.
  - `mining_detection/`: Mining analysis workflow, AI service integration, and custom UI.
  - `carbon_tracker/`: Satellite data models (OCO-2, GOSAT-2) and ingestion logic.
  - `co2_management/`: Management of CO2 measurement sources and comparison jobs.
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

## 🔍 Key Integration Points
- **AI Service:** Integration layer in `src/mining_detection/services.py`.
- **Satellite Data:** Storage and profile management in `src/carbon_tracker/models.py`.
- **GeoServer:** Automatic publishing via GeoNode's signal-based or explicit API interactions.

## 🔄 Development Workflow

To maintain high code quality and architectural consistency, all changes must follow this standardized workflow:

### 1. Research & Planning
- **Analyze:** Use `grep_search` and `glob` to map dependencies and existing patterns.
- **Design:** For complex features or architectural changes, use `enter_plan_mode` to draft a design document (e.g., `functional_design_v2.md`).
- **Reproduce:** For bug fixes, create a reproduction script or a failing test case before implementing the fix.

### 2. Implementation
- **Surgical Edits:** Apply targeted changes using `replace` or `write_file`. Avoid unrelated refactoring.
- **Conventions:** Adhere to Django/DRF best practices, type hinting (Python 3.12+), and GeoNode's integration patterns.
- **Logic Placement:** Keep business logic in `services.py` or `tasks.py`. Views should remain lean.
- **Comments:** Provide clear, concise comments for complex logic blocks.

### 3. Testing & Validation
- **Automated Tests:** Add or update test cases in `tests.py`. Use Django's `TestCase` or `APITestCase`.
- **Manual Verification:** Verify UI changes and API responses within the Docker environment.
- **Static Analysis:** Run linting (`flake8`) and type checking if applicable.

### 4. Documentation
- **Technical Docs:** Update module-level documentation (e.g., `src/co2_management/functional_design.md`) when features change.
- **Platform Docs:** Update `GEMINI.md` or `MEMORY.md` if the change affects project-wide architecture or workflows.

### 5. Committing
- **Atomic Commits:** Keep commits focused on a single logical change.
- **Commit Messages:** Follow a clear structure (e.g., `feat: add xco2 comparison logic` or `fix: resolve race condition in importer`). Propose a draft for review before final execution.
- **Branching:** Work on feature/bugfix branches named appropriately (e.g., `feature/co2-analytics`).

## User note: 
- Nhớ comment code ở những đoạn code phức tạp

---
*This file is maintained for AI agent context. Update it when significant architectural changes occur.*
