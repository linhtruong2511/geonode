# Frontend Architecture

## Django-React Mounting
The entry point is `frontend/src/loader.tsx`. It looks for a DOM element with `id="co2-management-root"`.

In Django template `src/co2_management/templates/co2_management/react_app.html`:
```html
<div id="co2-management-root" data-react-app="CO2ManagementApp"></div>
```

## Routing
- **Django**: Manages top-level paths and permissions.
- **React Router**: Uses `HashRouter` inside `CO2ManagementApp.tsx` for sub-navigation within the React app.

## Vite Configuration
`vite.config.ts` handles:
- **Base path**: `/static/co2_management/react/`
- **Output directory**: Correctly points to the Django app's static folder.
- **Aliases**: `@common` and `@co2` for cleaner imports.
