"""
Claude Vision image analysis for tactical threat detection.
"""
import os, math, base64, json, re, io
import anthropic
from PIL import Image

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

DRONE_ALTITUDE_M = 150
CAMERA_FOV_DEG   = 67.4   # from real photo EXIF (Samsung SM-A520W)


def _coverage_deg(lat: float):
    half_width_m = DRONE_ALTITUDE_M * math.tan(math.radians(CAMERA_FOV_DEG / 2))
    dlat = half_width_m / 111_000
    dlng = half_width_m / (111_000 * math.cos(math.radians(lat)))
    return dlat, dlng


def _threat_box_to_geojson(x_min, y_min, x_max, y_max, center_lat, center_lng):
    dlat, dlng = _coverage_deg(center_lat)
    west  = center_lng - dlng;  east  = center_lng + dlng
    north = center_lat + dlat;  south = center_lat - dlat
    coords = [[
        [west  + x_min*(east-west), north - y_min*(north-south)],
        [west  + x_max*(east-west), north - y_min*(north-south)],
        [west  + x_max*(east-west), north - y_max*(north-south)],
        [west  + x_min*(east-west), north - y_max*(north-south)],
        [west  + x_min*(east-west), north - y_min*(north-south)],
    ]]
    return {"type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": coords},
            "properties": {"kind": "ai_detected_threat"}}


PROMPT = """You are a military threat analysis AI analyzing an aerial drone image.

Identify threats: blocked roads, damaged structures, hostile vehicles, debris, hazardous areas.

Respond with ONLY valid JSON (no markdown):
{
  "threat_detected": true,
  "threat_type": "short label",
  "threat_description": "1-2 sentence tactical summary",
  "threat_zone": {"x_min": 0.2, "y_min": 0.3, "x_max": 0.7, "y_max": 0.8},
  "risk_level": 4
}

threat_zone is normalised image coordinates (0=top-left, 1=bottom-right).
risk_level: 1=low, 5=critical.
If no threat: threat_detected=false, risk_level=1."""


def analyze(image_bytes: bytes, center_lat: float, center_lng: float) -> dict:
    if not ANTHROPIC_API_KEY:
        return _fallback("No Anthropic API key configured", center_lat, center_lng)

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img.thumbnail((1024, 1024))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        b64 = base64.standard_b64encode(buf.getvalue()).decode()

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                    {"type": "text", "text": PROMPT}
                ]
            }]
        )

        raw = msg.content[0].text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)

        if data.get("threat_detected") and "threat_zone" in data:
            tz = data["threat_zone"]
            data["obstacle_geojson"] = _threat_box_to_geojson(
                tz["x_min"], tz["y_min"], tz["x_max"], tz["y_max"],
                center_lat, center_lng
            )
        return data

    except json.JSONDecodeError:
        return _fallback("Could not parse AI response", center_lat, center_lng, threat=True)
    except Exception as e:
        return _fallback(str(e), center_lat, center_lng)


def _fallback(reason, lat, lng, threat=False):
    result = {
        "threat_detected": threat,
        "threat_type": "ANALYSIS ERROR" if not threat else "UNKNOWN THREAT",
        "threat_description": reason,
        "risk_level": 3 if threat else 1,
    }
    if threat:
        result["obstacle_geojson"] = _threat_box_to_geojson(0.25, 0.25, 0.75, 0.75, lat, lng)
    return result
