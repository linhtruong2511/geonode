---
name: scientific-ui-theme
description: Guidelines and specifications for implementing a professional Scientific UI/UX theme (Light and Dark modes) for GIS and environmental monitoring dashboards. Use this skill when Gemini CLI needs to design or refactor UI components like KPI cards, advanced map filters, or data-dense scientific tables.
---

# Scientific UI Theme Skill

This skill documents the design language and technical implementation details for the "Scientific Dashboard" aesthetic developed for environmental monitoring platforms.

## 🎨 Design Tokens

### Light Theme (Default)
| Token | Variable | Value |
|-------|----------|-------|
| BG Primary | `--color-bg-primary` | `#f1f5f9` |
| BG Secondary | `--color-bg-secondary` | `#ffffff` |
| Accent Primary | `--color-accent-primary` | `#397aab` |
| Text Primary | `--color-text-primary` | `#0f172a` |
| Text Secondary | `--color-text-secondary` | `#64748b` |
| Border | `--color-border` | `#e2e8f0` |

### Dark Theme
| Token | Variable | Value |
|-------|----------|-------|
| BG Primary | `--color-bg-primary` | `#0d1117` |
| BG Secondary | `--color-bg-secondary` | `#161b22` |
| Card BG | `--color-bg-card` | `#1c2128` |
| Text Primary | `--color-text-primary` | `#e6edf3` |
| Text Secondary | `--color-text-secondary` | `#8b949e` |
| Border | `--color-border` | `#30363d` |

## 🅰️ Typography
- **Display**: `'IBM Plex Sans', sans-serif` (Technical and clean).
- **Monospace**: `'JetBrains Mono', monospace` (Precision for data points and IDs).

## 📐 Layout Principles
- **Dashboard Grid**: Map-centric (min 55-60% width).
- **Sidebar**: Default expanded with clear labels and `:hover/:active` accent border.
- **Top Bar**: Minimalist breadcrumbs with a Primary Action button (`btn-md btn-primary`).

## 🧩 Component Specifications

### 1. KPI Cards (`_kpi_card.html`)
- **Structure**: Icon (rounded background) + Value (Mono) + Suffix + Label (Caps).
- **Sparklines**: Integrated mini-charts (Chart.js) for 7-day trend visualization.
- **Responsive**: `col-xl-3 col-md-6 col-12 d-flex` (stacks correctly on mobile, equal height).

### 2. Advanced Filtering
- **Horizontal Bar**: Compact layout above data tables.
- **Filter Chips**: Interactive pills showing active filters with remove capability.
- **Responsive**: Stacks vertically on screens `< 767px`.

### 3. Scientific Tables (`.co2-table`)
- **Styling**: Minimalist borders, header background transparency, and `tr:hover` highlight.
- **Badges**: Standardized source badges (e.g., OCO-2 Blue, GOSAT-2 Purple).
- **Numbers**: Always use `font-mono` for alignment and readability.

### 4. Detail Visualizations
- **Quality Gauge**: Half-donut chart (0-100%) with status labels.
- **Vertical Profile**: Line chart with reversed Y-axis (Pressure in hPa).
- **Comparison Bar**: Horizontal axis showing Min, Mean, and Max on a single track.

## 🚀 Implementation Checklist
- [ ] Use `!important` to override system-wide Bootstrap defaults where necessary.
- [ ] Ensure all long-running jobs (like Imports) have progress bars and polling.
- [ ] Maintain accessibility (contrast ratio ≥ 4.5:1).
- [ ] Preserve query parameters in pagination (`.co2-pagination`).
