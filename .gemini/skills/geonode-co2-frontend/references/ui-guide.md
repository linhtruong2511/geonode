# UI & Styling Guide

## Design Tokens
Defined in `:root` of `co2_base.css`:
- `--color-accent-primary`: #397aab (Primary Blue)
- `--color-bg-primary`: #f1f5f9 (Light Gray)
- `--sidebar-bg`: #1e293b (Dark Slate)

## Components

### KpiCard
Location: `frontend/src/co2_management/components/KpiCard.tsx`
Props: `title`, `value`, `icon`, `color`.

### DataTable
Location: `frontend/src/common/components/DataTable.tsx`
Standard table with GeoNode-consistent styling.

## Layout CSS IDs
- `#co2-shell`: Global flex container.
- `#co2-sidebar`: Navigation panel.
- `#co2-split-container`: Holds map and content.
- `#co2-map-panel`: Map container.
- `#co2-content-panel`: Content container (on the right).
- `#co2-splitter`: Draggable bar.
