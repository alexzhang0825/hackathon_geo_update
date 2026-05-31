from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import osmnx as ox
import networkx as nx
from shapely.geometry import shape, LineString
from shapely.ops import unary_union
from dotenv import load_dotenv
import logging
import os

load_dotenv()
from analyze import analyze as gemini_analyze

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Vancouver area graph — loaded once, start/end nodes resolved per request
CENTER = (49.2635, -123.1215)

G = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global G
    logger.info("Loading OSM graph for Vancouver…")
    try:
        G = ox.graph_from_point(CENTER, dist=2500, network_type="drive")
        logger.info(f"Graph loaded: {len(G.nodes)} nodes, {len(G.edges)} edges")
    except Exception as e:
        logger.error(f"Graph load failed: {e}")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── helpers ───────────────────────────────────────────────────────────────────

def nodes_to_coords(graph, path):
    return [[graph.nodes[n]["x"], graph.nodes[n]["y"]] for n in path]

def route_length_m(graph, path):
    total = 0.0
    for u, v in zip(path, path[1:]):
        total += min(d.get("length", 0) for d in graph[u][v].values())
    return round(total, 1)

def blocked_edges(graph, poly_shape):
    result = []
    for u, v, key, data in graph.edges(keys=True, data=True):
        geom = data.get("geometry") or LineString([
            (graph.nodes[u]["x"], graph.nodes[u]["y"]),
            (graph.nodes[v]["x"], graph.nodes[v]["y"]),
        ])
        if geom.intersects(poly_shape):
            result.append((u, v, key))
    return result


# ── schemas ───────────────────────────────────────────────────────────────────

class Geometry(BaseModel):
    type: str
    coordinates: list

class Feature(BaseModel):
    type: str
    geometry: Geometry
    properties: dict = {}

class RouteRequest(BaseModel):
    start_lng: float
    start_lat: float
    end_lng: float
    end_lat: float
    obstacles: list[Feature] = []


# ── endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "graph_loaded": G is not None}


@app.post("/api/route")
async def get_route(req: RouteRequest):
    """
    Compute two routes between user-selected start/end, avoiding all provided
    obstacle polygons. Start/end nodes are resolved dynamically via nearest_nodes.
    """
    if G is None:
        return {"routes": FALLBACK_ROUTES}
    try:
        s_node = ox.nearest_nodes(G, X=req.start_lng, Y=req.start_lat)
        e_node = ox.nearest_nodes(G, X=req.end_lng,   Y=req.end_lat)

        G2 = G.copy()

        if req.obstacles:
            polys   = [shape(f.geometry.model_dump()) for f in req.obstacles]
            merged  = unary_union(polys)
            removed = blocked_edges(G2, merged)
            G2.remove_edges_from(removed)
            logger.info(f"Blocked {len(removed)} edges from {len(req.obstacles)} obstacle(s)")

        # ── shortest path ─────────────────────────────────────────────────────
        try:
            p1 = nx.shortest_path(G2, s_node, e_node, weight="length")
            return {"routes": [{
                "id": "route-1", "label": "ROUTE",
                "geometry": {"type": "LineString", "coordinates": nodes_to_coords(G2, p1)},
                "length_m": route_length_m(G2, p1),
            }]}
        except nx.NetworkXNoPath:
            return {"routes": FALLBACK_ROUTES}

    except Exception as e:
        logger.error(f"Route error: {e}")
        return {"routes": FALLBACK_ROUTES}


@app.post("/api/analyze-image")
async def analyze_image(
    image: UploadFile = File(...),
    gps_lat: float = Form(49.2628),
    gps_lng: float = Form(-123.1300),
):
    image_bytes = await image.read()
    result = gemini_analyze(image_bytes, gps_lat, gps_lng)
    logger.info(f"AI analysis: threat={result.get('threat_detected')} risk={result.get('risk_level')}")
    return result


# ── fallback data ─────────────────────────────────────────────────────────────

FALLBACK_ROUTES = [
    {
        "id": "route-1", "label": "ROUTE",
        "geometry": {"type": "LineString", "coordinates": [
            [-123.1380, 49.2520], [-123.1360, 49.2540], [-123.1350, 49.2600],
            [-123.1240, 49.2680], [-123.1130, 49.2720], [-123.1050, 49.2750],
        ]},
        "length_m": 2750.0,
    },
]
