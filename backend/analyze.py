"""
Gemini Vision image analysis for tactical threat detection.
Uses the current google-genai SDK (google.generativeai is deprecated).
"""
import os
import math
import base64
import json
import re
import io

from google import genai
from google.genai import types
from PIL import Image

GEMINI_API_KEY    = os.getenv("GEMINI_API_KEY", "")
DRONE_ALTITUDE_M  = 150
CAMERA_FOV_DEG    = 80


def _coverage_deg(lat: float):
    half_width_m = DRONE_ALTITUDE_M * math.tan(math.radians(CAMERA_FOV_DEG / 2))
    dlat = half_width_m / 111_000
    dlng = half_width_m / (111_000 * math.cos(math.radians(lat)))
    return dlat, dlng


def _threat_box_to_geojson(x_min, y_min, x_max, y_max, center_lat, center_lng):
    """Convert normalised image coords (0-1) to a GeoJSON Polygon."""
    dlat, dlng = _coverage_deg(center_lat)
    west, east   = center_lng - dlng, center_lng + dlng
    north, south = center_lat + dlat, center_lat - dlat

    obs_west  = west  + x_min * (east - west)
    obs_east  = west  + x_max * (east - west)
    obs_north = north - y_min * (north - south)
    obs_south = north - y_max * (north - south)

    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [obs_west,  obs_north],
                [obs_east,  obs_north],
                [obs_east,  obs_south],
                [obs_west,  obs_south],
                [obs_west,  obs_north],
            ]]
        },
        "properties": {"kind": "ai_detected_threat"}
    }


PROMPT = """You are a military threat analysis AI analyzing an aerial drone image.

Identify any threats, obstacles, blocked roads, enemy activity, damaged infrastructure,
vehicles, debris, or hazardous areas visible in this image.

Respond with ONLY valid JSON — no markdown, no explanation:
{
  "threat_detected": true or false,
  "threat_type": "short type label e.g. road blockage / hostile vehicles / structural damage",
  "threat_description": "1-2 sentence tactical summary of what you see",
  "threat_zone": {
    "x_min": 0.0,
    "y_min": 0.0,
    "x_max": 1.0,
    "y_max": 1.0
  },
  "risk_level": 1
}

threat_zone uses normalised image coordinates (0.0 = top-left, 1.0 = bottom-right).
risk_level is 1 (low) to 5 (critical).
If no threat is detected set threat_detected to false and risk_level to 1."""


def analyze(image_bytes: bytes, center_lat: float, center_lng: float) -> dict:
    if not GEMINI_API_KEY:
        return _fallback("No Gemini API key configured", center_lat, center_lng)

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img.thumbnail((1024, 1024))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        img_bytes = buf.getvalue()

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_text(text=PROMPT),
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
            ],
        )

        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        data = json.loads(raw)

        if data.get("threat_detected") and "threat_zone" in data:
            tz = data["threat_zone"]
            data["obstacle_geojson"] = _threat_box_to_geojson(
                tz["x_min"], tz["y_min"], tz["x_max"], tz["y_max"],
                center_lat, center_lng,
            )

        return data

    except json.JSONDecodeError:
        desc = response.text[:300] if "response" in dir() else "Analysis incomplete"
        return _fallback(desc, center_lat, center_lng, threat=True)
    except Exception as e:
        return _fallback(str(e), center_lat, center_lng)


def _fallback(reason: str, lat: float, lng: float, threat: bool = False) -> dict:
    result = {
        "threat_detected": threat,
        "threat_type": "ANALYSIS ERROR" if not threat else "UNKNOWN THREAT",
        "threat_description": reason,
        "risk_level": 3 if threat else 1,
    }
    if threat:
        result["obstacle_geojson"] = _threat_box_to_geojson(
            0.25, 0.25, 0.75, 0.75, lat, lng
        )
    return result
