# API Communication

## Axios Configuration
Standard axios is used. CSRF tokens are handled by Django when React is served from the same domain.

## Endpoint Patterns
- **Base URL**: `/co2/api/v1/`
- **Dashboard**: `axios.get('/co2/api/v1/dashboard/')`
- **Lists**: `axios.get('/co2/api/v1/measurements/')`

## State Management
- **Zustand**: Used for shared state like `useMapStore`.
- **Local State**: `useState` for component-specific data.
