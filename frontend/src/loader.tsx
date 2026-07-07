import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// CO2 App
import CO2ManagementApp from '@co2/CO2ManagementApp'
// Wind App
import WindManagementApp from '@wind/WindManagementApp'

document.addEventListener('DOMContentLoaded', () => {
    // 1. Mount CO2 Management App if container exists
    const co2El = document.getElementById('co2-management-root')
    if (co2El) {
        const root = createRoot(co2El)
        root.render(
            <React.StrictMode>
                <CO2ManagementApp />
            </React.StrictMode>
        )
    }

    // 2. Mount Wind Management App if container exists
    const windEl = document.getElementById('wind-management-root')
    if (windEl) {
        const root = createRoot(windEl)
        root.render(
            <React.StrictMode>
                <WindManagementApp />
            </React.StrictMode>
        )
    }
})
