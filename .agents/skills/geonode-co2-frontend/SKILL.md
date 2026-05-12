---
name: geonode-co2-frontend
description: Frontend development guidelines for the GeoNode CO2 Management module. Use when modifying or creating React components, updating the dashboard, or integrating React with Django templates in this project.
---

# GeoNode CO2 Management Frontend Skill

This skill provides the architectural patterns, UI/UX standards, and integration workflows for the frontend of the CO2 Management system.

## Core Architecture: Django-React Hybrid

The project uses a hybrid approach:
- **Django** handles Routing (for top-level pages), Authentication, and the main Layout.
- **React** is embedded into specific pages via `<div id="react-root-...">`.
- **Vite** builds React code into static bundles loaded by Django.

### Build & Deployment Workflow
1. **Develop**: React code is in `frontend/src/`.
2. **Build**: Run `npm run build` in `frontend/` to output to `src/co2_management/static/co2_management/react/`.
3. **Sync**: Run `docker-compose exec django python manage.py collectstatic --noinput` in `src/` to update GeoNode's static storage.

## UI/UX Standards

### Styling
- **Vanilla CSS**: Prefer Vanilla CSS for flexibility. Avoid TailwindCSS.
- **Base CSS**: `frontend/src/co2_management/styles/co2_base.css` contains the design tokens and layout shell.
- **Theme**: Follow the Scientific UI/UX theme (professional, data-dense, clean).

### Layout Pattern
The app uses a triple-column/panel layout:
1. **Sidebar**: Navigation (Django/React links).
2. **Map Panel (Center)**: Flexible Leaflet map.
3. **Content Panel (Right)**: Resizable panel for data views, lists, and forms.

## Common Components
- **DataTable**: Shared component for rendering data lists with filtering.
- **KpiCard**: Used for high-level statistics on dashboards.
- **React-Leaflet**: Used for spatial data visualization.

## Reference Materials
For detailed implementation patterns, see:
- [architecture.md](references/architecture.md): Django/React integration details.
- [ui-guide.md](references/ui-guide.md): Styling and component library.
- [api.md](references/api.md): DRF API communication patterns.
