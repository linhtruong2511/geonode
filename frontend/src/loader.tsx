import React from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Registry of all React apps available in the system.
 * Use React.lazy for code splitting - code is only loaded when needed.
 */
const Apps: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  CO2ManagementApp: React.lazy(() => import('./co2_management/CO2ManagementApp')),
};

/**
 * Finds all elements with [data-react-app] and mounts the corresponding component.
 */
const mountApps = () => {
  const containers = document.querySelectorAll('[data-react-app]');
  
  containers.forEach((container) => {
    const appName = container.getAttribute('data-react-app');
    
    if (appName && Apps[appName]) {
      const Component = Apps[appName];
      const root = createRoot(container);
      
      root.render(
        <React.StrictMode>
          <React.Suspense fallback={
            <div className="p-4 text-center">
              <i className="fa fa-spinner fa-spin fa-2x text-muted"></i>
              <div className="mt-2 text-muted">Loading {appName}...</div>
            </div>
          }>
            <Component />
          </React.Suspense>
        </React.StrictMode>
      );
      
      // Mark as mounted to prevent multiple mounts
      container.removeAttribute('data-react-app');
      container.setAttribute('data-react-mounted', appName);
    } else if (appName) {
      console.warn(`React App "${appName}" not found in registry.`);
    }
  });
};

// Initial mount
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApps);
} else {
  mountApps();
}

// Global helper to trigger re-mount (useful if content is loaded via AJAX)
(window as any).remountReactApps = mountApps;
