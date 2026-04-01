# GeoNode Mining Detection Platform

This repository contains a GeoNode-based GIS platform extended with a custom Django app named `mining_detection`. The custom app adds domain models, server-rendered pages, REST APIs, and background processing for AI-assisted mining analysis workflows.

This README is written as technical onboarding documentation for engineers joining the project. It explains what the system does, how the codebase is organized, where the main flows live, and which components you should understand first.

## Table of Contents

- [1. What This Project Is](#1-what-this-project-is)
- [2. High-Level Architecture](#2-high-level-architecture)
- [3. Repository Structure](#3-repository-structure)
- [4. Runtime Components](#4-runtime-components)
- [5. Django Project Layout](#5-django-project-layout)
- [6. The `mining_detection` App](#6-the-mining_detection-app)
- [7. Core Domain Models](#7-core-domain-models)
- [8. Analysis Job Lifecycle](#8-analysis-job-lifecycle)
- [9. Monitoring and Violation Flows](#9-monitoring-and-violation-flows)
- [10. Web UI Pages](#10-web-ui-pages)
- [11. REST API Surface](#11-rest-api-surface)
- [12. Background Tasks and Celery](#12-background-tasks-and-celery)
- [13. Configuration and Environment](#13-configuration-and-environment)
- [14. Frontend and Template Conventions](#14-frontend-and-template-conventions)
- [15. Development Workflow](#15-development-workflow)
- [16. Where New Developers Should Start](#16-where-new-developers-should-start)
- [17. Common Extension Scenarios](#17-common-extension-scenarios)
- [18. Troubleshooting Notes](#18-troubleshooting-notes)

## 1. What This Project Is

At its core, this is a standard GeoNode deployment with a custom business module for mining detection and monitoring.

The platform combines:

- GeoNode and GeoServer for geospatial dataset management and publishing
- Django for web pages, business logic, forms, and permissions
- Django REST Framework for programmatic APIs
- Celery for asynchronous job execution and polling
- An external AI service for remote inference
- Custom templates for operational workflows such as job creation, monitoring, violation tracking, and reporting

The custom functionality is implemented mainly in `src/mining_detection/`.

## 2. High-Level Architecture

The system has two major layers:

1. The base GeoNode platform
2. The custom mining workflow layer

Typical end-to-end flow:

1. A user opens the custom mining pages under `/mining-detection/`.
2. The user creates an analysis job and selects a raster dataset as input.
3. Django stores the job locally and sends a request to the AI service.
4. Celery polls the remote execution status in the background.
5. When the AI service finishes, the result is imported or linked back into GeoNode.
6. The job detail page shows execution metadata, derived statistics, and output layers.
7. The job list and report pages expose filtering, status tracking, and aggregated analytics.

Conceptually, the system looks like this:

```text
User Browser
    |
    v
Django + GeoNode + Custom Templates
    |
    +--> GeoNode Dataset / GeoServer publication
    |
    +--> Django REST API
    |
    +--> Celery tasks
            |
            v
      External AI Service
            |
            v
      Result metadata / output datasets
```

## 3. Repository Structure

The important top-level directories are:

```text
.
|-- docker/                     # Container support files
|-- logs/                       # Runtime logs
|-- src/                        # Main application source tree
|   |-- geonode_project/        # Django project configuration
|   |-- mining_detection/       # Custom mining module
|   |-- fixtures/               # Optional data fixtures
|   |-- manage.py               # Django entry point
|   |-- requirements.txt        # Python dependencies
|   |-- pyproject.toml          # Python tooling configuration
|   |-- tasks.py                # Project-level task helpers
|   |-- celery.sh               # Celery startup helper
|   |-- celery-cmd              # Celery command wrapper
|   |-- entrypoint.sh           # Container startup script
|   `-- uwsgi.ini               # uWSGI configuration
|-- .devcontainer/              # Dev container support
|-- docker-compose.yml          # Main runtime orchestration
|-- Dockerfile                  # Main image build
|-- .env.sample                 # Environment template
`-- README.md                   # This document
```

## 4. Runtime Components

From the current `docker-compose.yml`, the platform is designed around these runtime services:

- Django application container
- Celery worker container
- Nginx
- GeoServer
- PostgreSQL / PostGIS
- Redis
- Memcached
- Optional Let's Encrypt support

The Django settings also expect an AI service reachable at:

```text
http://ai_api:8001
```

That service is not implemented inside this repository. The mining workflow assumes it already exists and exposes endpoints such as model catalog and job execution APIs.

## 5. Django Project Layout

The Django project entry point is `src/manage.py`, which uses:

```python
DJANGO_SETTINGS_MODULE = "geonode_project.settings"
```

The project package is `src/geonode_project/`.

### `geonode_project/settings.py`

This file extends the default GeoNode settings and then adds local project customization. Important project-specific responsibilities include:

- registering the `mining_detection` app
- setting template and static paths
- configuring internationalization
- defining custom logging
- providing the AI service base URL
- configuring map baselayers used by the UI

Notable settings that matter to new developers:

- `AI_SERVICE_URL = "http://ai_api:8001"`
- custom `MAPSTORE_BASELAYERS`
- multiple UI languages including Vietnamese and English

### `geonode_project/urls.py`

This is the root URL dispatcher. It keeps standard GeoNode routes and mounts the mining module at:

- `/mining-detection/`
- `/api/v2/`

The `/api/v2/` namespace is important because the custom UI often reads dataset metadata and job state through API endpoints under this prefix.

## 6. The `mining_detection` App

This app contains nearly all custom business logic. It mixes classic Django patterns with GeoNode-specific integration.

Main files and their roles:

- `models.py`: domain entities for jobs, statistics, sites, monitoring records, and violations
- `template_views.py`: server-rendered pages for the custom application
- `views.py`: REST endpoints, upload handlers, and API actions
- `api_urls.py`: DRF router registration
- `urls.py`: human-facing page routes and action endpoints
- `services.py`: integration logic for communicating with the external AI service
- `tasks.py`: Celery jobs for submission, polling, result ingestion, and scheduled work
- `forms.py`: Django forms used by CRUD views
- `serializers.py`: DRF serializers for the API layer
- `templates/mining_detection/`: HTML templates for the custom UI

Think of the app as having four sublayers:

1. Domain models
2. HTML views and forms
3. REST API endpoints
4. External service integration and background processing

## 7. Core Domain Models

The most important model for understanding the system is `MiningDetectionJob`.

### `MiningDetectionJob`

This model represents one analysis request sent to the AI engine.

Key fields include:

- `job_id`: remote execution identifier
- `title`: human-readable label
- `aoi_geom`: area of interest geometry
- `date_from`, `date_to`: analysis time range
- `model_version`: selected AI model
- `cloud_cover_pct`: image filtering parameter
- `extra_params`: flexible JSON payload for request or result metadata
- `status`: one of `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`
- `error_message`: failure details
- `poll_count`: number of status checks performed
- `created_by`: job owner
- `base_dataset`: the source dataset used for inference
- `result_dataset`: the GeoNode dataset produced from the result, when available
- `shapefile_url`, `result_execution_id`: output references
- `message_progress`, `progress_percentage`: progress reporting fields

Useful computed properties exist for:

- duration
- GeoNode layer naming
- edit/delete safety checks

### `InferenceStatistics`

This is a one-to-one detail record attached to a job after analysis finishes. It stores structured summary values produced from the AI output, for example:

- total detected area
- number of detections
- min and max polygon area
- vegetation or water indicators such as average NDVI and NDWI
- raw response payload
- severity label

This model powers summary views, job detail displays, and reporting.

### Reference and Administrative Models

The app also contains a set of master-data models used by forms and validation:

- `MineralType`
- `CoordinateSystem`
- `Province`
- `District`
- `Ward`
- `PlanningZone`

These support structured site management instead of free-form text everywhere.

### `MiningSite`

This model describes a known mining location or managed site. It links to:

- administrative areas
- mineral types
- planning zones
- coordinate systems
- related monitoring datasets

It also stores operational fields such as area, reserve, licensing status, and automated monitoring settings.

### `BoundaryPoint`

This model stores boundary geometry details for a mining site in a structured way.

### `MonitoringRecord`

This model represents monitoring observations associated with a site. It is part of the ongoing surveillance workflow rather than one-time inference only.

### `Violation`

This model stores rule breaches or suspicious findings linked to monitored entities and analysis outcomes.

## 8. Analysis Job Lifecycle

Understanding the job lifecycle is the fastest way to understand the project.

### Step 1: User creates a job

The user opens the job creation page and submits a form that includes:

- analysis title
- selected AI model
- source raster dataset
- date range
- AOI or related spatial input
- optional execution parameters

The job creation flow is implemented primarily in:

- `mining_detection/template_views.py`
- `mining_detection/forms.py`

### Step 2: The app resolves dataset context

When the job is created, the system tries to associate the selected source dataset with a GeoNode `Dataset` record.

The project uses raster datasets as the main analysis input. The UI now reflects that assumption by surfacing raster-only selection patterns in job creation and job search.

### Step 3: The job is sent to the AI service

`mining_detection/services.py` contains the integration layer responsible for:

- reading available models from the AI service
- building model choices for the UI
- sending analysis requests
- mapping AI payloads into local Django models

Important helper functions include:

- `get_ai_model_catalog()`
- `build_model_choices()`
- `send_analyze_job()`
- `populate_job_from_payload()`
- `save_job_to_db()`
- `clone_job_for_retry()`

### Step 4: Celery polls remote progress

The AI service is asynchronous. Instead of blocking the request/response cycle, the project uses Celery workers to:

- submit jobs
- poll execution status
- fetch results
- update local status and statistics

### Step 5: Result datasets are linked back into GeoNode

When a remote execution finishes, the project tries to resolve the produced dataset into a GeoNode `Dataset` through execution metadata. This link is what makes result layers visible and traceable in the platform.

### Step 6: Users inspect details and analytics

The finished job can then be reviewed from:

- the job list page
- the job detail page
- the job statistics/report page

## 9. Monitoring and Violation Flows

The repository contains more than just one-off inference jobs. It also supports a broader monitoring workflow.

### Monitoring

Monitoring features center around `MiningSite`, `MonitoringRecord`, and linked datasets. A site can carry monitoring-related configuration and associated raster datasets used for periodic inspection.

There is also task support for monitoring dataset resolution and scheduled data pulls, including helper logic in `tasks.py`.

### Violations

Violation management provides a place to record suspicious activity, exceptions, or policy breaches discovered from monitoring or analysis outputs. This gives the platform an operational follow-up layer instead of stopping at raw AI inference.

## 10. Web UI Pages

The custom UI is implemented with Django templates under:

```text
src/mining_detection/templates/mining_detection/
```

The common layout shell is:

- `app_base.html`

That base template provides the shared page structure, navigation, common scripts, and styling hooks. It also hosts shared frontend libraries such as Leaflet and Chart.js so child pages can reuse them.

### Major server-rendered pages

The main page controllers live in `template_views.py`.

Important job-related pages include:

- `JobListView`: list, filter, and manage analysis jobs
- `JobCreateView`: create a new analysis job
- `JobDetailView`: inspect one job, including outputs and metadata
- `JobReportView`: chart-based reporting page for aggregated analysis results

Important non-job pages include:

- dashboard pages
- mining site management
- monitoring management
- violation management
- master-data CRUD pages for administrative/reference entities

### Recent UI patterns already in the codebase

The current job management pages include:

- raster dataset selection for job creation
- advanced dataset search on the job list page
- a dedicated report page reachable from the job list via a "Thống kê" button
- Leaflet-based map interactions
- chart-based reporting for counts, status, dataset usage, and model usage

When extending the UI, keep the existing layout and card patterns instead of introducing a different visual language.

## 11. REST API Surface

The project exposes API endpoints through Django REST Framework.

### Router-based API

`mining_detection/api_urls.py` registers a router for:

- `mining-jobs`

This maps to `MiningDetectionJobViewSet` in `views.py`.

### `MiningDetectionJobViewSet`

This viewset is the main programmatic API surface for job operations. Its responsibilities include:

- CRUD behavior for jobs
- retry actions
- aggregated statistics endpoints
- GeoNode layer resolution
- completion notification support

### Upload and import endpoints

`views.py` also includes custom upload/import logic built on GeoNode upload execution flows, such as:

- `UploadExecution`
- `UploadSentinelData`
- `UploadResultDetection`

These are important when you need to understand how remote outputs become GeoNode datasets.

## 12. Background Tasks and Celery

The custom Celery logic lives in `src/mining_detection/tasks.py`.

Important tasks include:

- `sync_job`: submit and poll AI jobs
- `submit_job`: create remote execution
- `save_result_job`: persist final results and statistics
- `get_dataset_from_execution_id`: connect output execution records to GeoNode datasets
- `get_monitoring_dataset_from_execution_id`: similar resolution for monitoring datasets
- `find_geonode_dataset`: helper to resolve `ExecutionRequest` to `Dataset`
- `download_sentinel2_data_cron_tab`: scheduled dataset-related work

Why this matters:

- user requests stay responsive
- failures can be retried
- long-running AI operations do not block web requests
- dataset synchronization can happen after remote execution completes

When debugging job state issues, you often need to inspect:

1. Django database records
2. Celery worker logs
3. AI service responses
4. GeoNode dataset import state

## 13. Configuration and Environment

### Environment files

The root `.env` file drives container configuration. `.env.sample` provides the starting template.

The repository also includes `create-envfile.py` to help generate an environment file.

### Settings hotspots

If you need to change behavior, these are the first places to inspect:

- `src/geonode_project/settings.py`
- `docker-compose.yml`
- `src/mining_detection/services.py`
- `src/mining_detection/tasks.py`

### AI integration

The AI engine endpoint is configured in Django settings. If the AI service location changes, update `AI_SERVICE_URL`.

If model options do not appear in the UI, start by checking:

1. AI service availability
2. network connectivity between Django and the AI container
3. `/models` response format
4. error handling in `build_model_choices()`

### GeoNode dataset assumptions

The mining workflow assumes that relevant source data exists as GeoNode `Dataset` records and that raster datasets are the primary valid input for analysis.

Several parts of the UI and backend use the dataset `alternate` field as a stable coverage identifier when matching local records to AI payloads.

## 14. Frontend and Template Conventions

This project uses Django templates, not a separate SPA frontend.

Important conventions:

- shared layout comes from `app_base.html`
- page-specific templates live in `templates/mining_detection/`
- Leaflet is used for map display and spatial interaction
- Chart.js is available globally through the shared base template
- pages should inherit the existing card, spacing, and toolbar patterns

When adding a new page:

1. create a template under `templates/mining_detection/`
2. add a view in `template_views.py`
3. register the route in `urls.py`
4. reuse `app_base.html`
5. keep filtering and pagination behavior consistent with existing pages

## 15. Development Workflow

### Local development

The repository is designed primarily for Docker-based development.

Typical workflow:

1. prepare `.env`
2. build and start containers
3. run Django migrations
4. create or load initial data
5. ensure Celery is running
6. verify connectivity to GeoServer and the AI service

The repository also includes `.devcontainer/` for containerized VS Code workflows.

### Code areas by concern

If you need to work on a specific feature, start here:

- business entities: `models.py`
- page behavior: `template_views.py` and templates
- form changes: `forms.py`
- API changes: `views.py`, `serializers.py`, `api_urls.py`
- AI integration: `services.py`
- async and polling logic: `tasks.py`
- global wiring: `geonode_project/settings.py` and `urls.py`

## 16. Where New Developers Should Start

For onboarding, the recommended reading order is:

1. `src/geonode_project/settings.py`
2. `src/geonode_project/urls.py`
3. `src/mining_detection/models.py`
4. `src/mining_detection/template_views.py`
5. `src/mining_detection/views.py`
6. `src/mining_detection/services.py`
7. `src/mining_detection/tasks.py`
8. `src/mining_detection/templates/mining_detection/app_base.html`

Then walk through one real use case:

1. open the job list page
2. create a job
3. follow how the form submits
4. inspect the saved `MiningDetectionJob`
5. follow Celery status updates
6. confirm how the result dataset is linked
7. review the job detail page
8. review the report page

This single flow will expose most important integration points in the codebase.

## 17. Common Extension Scenarios

### Add a new field to analysis jobs

You will usually need to update:

- `models.py`
- migrations
- `forms.py`
- `template_views.py`
- related templates
- `serializers.py`
- `services.py` if the AI payload changes

### Add a new chart or report metric

You will usually need to update:

- aggregation logic in `template_views.py`
- the report template in `job_report.html`
- possibly the job list page if you also want navigation or filters

### Add a new page to the custom module

You will usually need to update:

- `template_views.py`
- `urls.py`
- `templates/mining_detection/`
- sidebar or action buttons in existing templates

### Add a new AI model parameter

You will usually need to update:

- job form fields
- validation
- payload building in `services.py`
- retry or clone logic
- job detail rendering

## 18. Troubleshooting Notes

### Job stuck in `PENDING` or `RUNNING`

Check:

- Celery worker is running
- Redis is available
- AI service is reachable
- remote job ID was stored correctly
- polling tasks are being scheduled and executed

### Result dataset missing

Check:

- remote execution finished successfully
- `result_execution_id` was stored
- GeoNode import pipeline created a dataset
- dataset lookup by execution ID still matches current metadata

### Model list empty on the create page

Check:

- `AI_SERVICE_URL`
- AI `/models` response
- error logs from `services.py`

### UI page works but filters look wrong

Check:

- GET parameter names in the template
- corresponding query logic in `template_views.py`
- pagination query-string preservation

## Final Notes

This repository is best understood as a GeoNode platform with a custom operational module built around asynchronous AI analysis of raster datasets.

If you only remember three things on your first week, remember these:

1. `mining_detection` is the real business module.
2. `MiningDetectionJob` is the core entity.
3. The most important integration boundary is the handoff between Django, Celery, GeoNode datasets, and the external AI service.

Once you understand that boundary, the rest of the project becomes much easier to navigate.
