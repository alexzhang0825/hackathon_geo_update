# Tactical Route Planner

> Drone-assisted AI route planning for tactical ground operations.

A real-time route planning system that uses drone imagery and AI threat detection to dynamically reroute units around danger zones. Built in 4 hours for a hackathon.

---

## Demo Flow

1. **Map loads** — Vancouver satellite view, unit moving from Point A (Marpole) to Point B (Olympic Village) along the shortest route
2. **Upload drone image** — system reads real GPS from photo EXIF, sends image to Gemini Vision AI
3. **AI analyzes** — detects threats (damaged structures, blocked roads, hostile activity), returns threat zone coordinates
4. **Obstacle appears** — danger zone overlaid on map as a red polygon at the real GPS location
5. **Routes recalculate** — two alternate routes generated in real time, avoiding the threat zone
6. **Adjust parameters** — change Troop Size and Threat Level sliders to see route scoring update live

---

## Architecture

```
┌─────────────────┐     upload image + GPS     ┌──────────────────────┐
│   React Frontend │ ─────────────────────────► │   FastAPI Backend     │
│   Mapbox GL JS   │                            │                      │
│   Dark tactical  │ ◄───────────── routes ──── │  Gemini Vision API   │
│   UI             │                            │  → threat detection  │
│                  │ ◄──────── obstacle GeoJSON ─│                      │
│                  │                            │  osmnx + NetworkX    │
└─────────────────┘                            │  → route calculation  │
                                               └──────────────────────┘
```

**Frontend** (`frontend/`)
- React + Vite
- Mapbox GL JS v3 (satellite-streets basemap)
- Real-time route rendering with glow effects
- Image upload with GPS input
- Live route scoring from parameter sliders

**Backend** (`backend/`)
- FastAPI
- `osmnx` — downloads real OpenStreetMap road network for Vancouver
- `NetworkX` — shortest path + penalised alternate path algorithms
- `google-genai` — Gemini 1.5 Flash vision model for threat analysis
- Obstacle polygon from AI output geo-projected using drone altitude + camera FOV

---

## AI Pipeline

```
Drone image (JPEG)
    + GPS coordinates (from EXIF or manual input)
            │
            ▼
    Gemini Vision API
    ┌─────────────────────────────────────┐
    │  Prompt: analyze aerial image for   │
    │  threats, return JSON with:         │
    │  - threat_detected                  │
    │  - threat_type                      │
    │  - threat_description               │
    │  - threat_zone {x,y min/max 0-1}    │
    │  - risk_level (1-5)                 │
    └─────────────────────────────────────┘
            │
            ▼
    Geo-projection
    (image % coords × drone coverage → lat/lng polygon)
            │
            ▼
    osmnx removes blocked edges
    NetworkX finds 2 diverging routes
            │
            ▼
    GeoJSON routes returned to frontend
```

---

## Route Scoring

Sliders update scores client-side in real time (no network call):

```
score = length_score + troop_bonus + threat_bonus

Alpha Route: shorter, favoured by large troop size, penalised at high threat
Bravo Route: longer, more covered, favoured at high threat level
```

Score < 20 → route rejected and hidden from map.

**Demo moments:**
- Troop Size 80 + Threat Level 1 → Bravo route disappears
- Troop Size 10 + Threat Level 5 → Alpha route disappears

---

## Getting Started

**Requirements:** Python 3.9+, Node.js 18+

### Backend

```bash
cd backend
pip install -r requirements.txt

# Create .env file
echo "GEMINI_API_KEY=your_key_here" > .env

python -m uvicorn main:app --reload --port 8000
```

Get a Gemini API key at [aistudio.google.com](https://aistudio.google.com) → Get API key → Create API key

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Map | Mapbox GL JS v3 (satellite-streets) |
| Frontend | React 18, Vite 5 |
| Backend | FastAPI, Python 3.9 |
| Road network | osmnx + OpenStreetMap |
| Routing | NetworkX (shortest path + penalised divergence) |
| AI vision | Google Gemini 1.5 Flash |
| Geo-projection | Custom: image % → lat/lng via FOV + altitude |

---

## Project Structure

```
├── backend/
│   ├── main.py          # FastAPI app, osmnx routing, /api/routes, /api/analyze-image
│   ├── analyze.py       # Gemini Vision integration + geo-projection
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # State management, scoring logic
│   │   ├── components/
│   │   │   ├── MapView.jsx       # Mapbox GL layers
│   │   │   └── ControlPanel.jsx  # Sliders, image upload, route cards
│   │   └── index.css             # Dark tactical theme
│   └── index.html
└── README.md
```

---

## Hackathon Context

**Theme:** Your Second Brain — Build AI that helps people remember, learn, reason and interact with the knowledge they already have.

**Our take:** In high-stakes tactical environments, the team's collective knowledge of safe routes degrades the moment conditions change. This system acts as an AI second brain for ground units — continuously processing new visual intelligence from drones and translating it into actionable route decisions, so operators can focus on the mission instead of map analysis.
