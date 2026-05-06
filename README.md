# Drone Fleet Management System

A comprehensive web-based application for drone fleet management, mission planning, and post-flight telemetry analysis. Built with React, Vite, and Supabase.

## Key Features

### 1. Mission Planner (`/missions`)
* **Interactive Waypoint Navigation:** Click-to-add routing using Leaflet maps.
* **Custom Parameters:** Set specific altitude and speed for every waypoint.
* **Dynamic No-Fly Zones (NFZ):** Real-time integration with OpenStreetMap (Overpass API) to automatically detect and block routes over critical infrastructure (airports, military bases, hospitals, power plants).
* **Smart Calculations:** Automatic estimation of total route distance and flight time.
* **Export:** Generate and download `.waypoints` files (QGC WPL 110 format) for ArduPilot/PX4.

### 2. Post-Flight Logbook (`/logbook`)
* **Telemetry Import:** Parse `.csv` flight logs directly in the browser using PapaParse.
* **Plan vs. Actual:** Overlay the flown track over the planned mission route on the map.
* **Advanced Analytics:** Dual-axis charts (Chart.js) visualizing Altitude, Speed, Satellite count, and Battery Voltage.
* **Automated Anomaly Detection:** Algorithm that flags critical battery drops, GPS loss, overspeeding, and course deviations.
* **PDF Reporting:** One-click generation of professional Post-Flight Reports including maps, charts, and recommendations.

### 3. Analytics Dashboard (`/dashboard`)
* **Fleet Overview:** High-level metrics including Total Drones, Planned Missions, and Analyzed Flights.
* **Performance Tracking:** Compare "Planned" vs "Actual Flown" distance for each specific drone.
* **Time & Incident Tracking:** Visual representation of total flight hours and detected hardware/software anomalies.

### 4. Drone Registry & RBAC (`/drones`)
* **Role-Based Access Control:** Administrators can manage the entire fleet, while Pilots only see drones assigned to them.
* **Hardware Profiles:** Store specific limits like Max Flight Time, Weight, and Controller Type.

## 🛠 Tech Stack

* **Frontend:** React.js, Vite
* **Routing:** React Router DOM
* **Database & Auth:** Supabase (PostgreSQL, Row Level Security)
* **Maps & Geospatial:** React-Leaflet, OpenStreetMap Overpass API
* **Charts:** Chart.js, React-Chartjs-2
* **PDF Generation:** jsPDF, html2canvas
* **Icons:** Lucide React

## Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/your-username/drone-system.git](https://github.com/your-username/drone-system.git)
   cd drone-system
2. Install dependencies:
    Bash
    npm install
3. Environment Variables:
    Create a .env file in the root directory and add your Supabase credentials:

    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
4. Start the development server:
    Bash
    npm run dev