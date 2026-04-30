import re
import json
import httpx

_CROP_CALENDAR: dict = {
    "wheat":    {"sow": "Nov–Dec", "harvest": "Apr–May", "water_mm": 400,  "temp_c": "15–25", "notes": "Winter crop; needs cool germination, warm grain fill."},
    "rice":     {"sow": "Jun–Jul", "harvest": "Oct–Nov", "water_mm": 1200, "temp_c": "24–35", "notes": "Kharif crop; high water; avoid cold nights during flowering."},
    "cotton":   {"sow": "Apr–May", "harvest": "Sep–Nov", "water_mm": 700,  "temp_c": "27–37", "notes": "Kharif; sensitive to frost and excessive rain during boll opening."},
    "maize":    {"sow": "Mar–Apr (rabi) / Jul (kharif)", "harvest": "Jul / Nov", "water_mm": 500, "temp_c": "18–32", "notes": "Dual season; needs good drainage and moderate humidity."},
    "sugarcane":{"sow": "Feb–Mar", "harvest": "Dec–Jan", "water_mm": 1500, "temp_c": "26–35", "notes": "Ratoon crop; needs frost-free winters for juice yield."},
    "mustard":  {"sow": "Oct–Nov", "harvest": "Feb–Mar", "water_mm": 300,  "temp_c": "10–25", "notes": "Short rabi; low water; suits arid Punjab/Sindh."},
    "mango":    {"sow": "perennial", "harvest": "Jun–Sep", "water_mm": 800, "temp_c": "24–40", "notes": "Needs dry cool spell in winter to induce flowering; avoid frost."},
    "citrus":   {"sow": "perennial", "harvest": "Dec–Feb", "water_mm": 900, "temp_c": "13–38", "notes": "Needs mild winters; sensitive to waterlogging."},
    "potato":   {"sow": "Oct–Nov", "harvest": "Feb–Mar", "water_mm": 500,  "temp_c": "15–25", "notes": "Cool weather essential for tuber development."},
    "onion":    {"sow": "Oct–Nov", "harvest": "Mar–Apr", "water_mm": 350,  "temp_c": "13–24", "notes": "Long-day crop; avoid rain at harvest."},
    "sunflower":{"sow": "Feb–Mar / Aug–Sep", "harvest": "May–Jun / Nov–Dec", "water_mm": 500, "temp_c": "20–35", "notes": "Dual season; drought tolerant; high solar needs."},
    "gram":     {"sow": "Oct–Nov", "harvest": "Mar–Apr", "water_mm": 250,  "temp_c": "10–25", "notes": "Chickpea / channa; low water rabi; frost risk in mountains."},
}


def _extract_context(body: dict) -> tuple[str, float | None, float | None]:
    sys_p = (body.get("system") or "").lower()
    loc_name = "the selected location"
    avg_t = rain_mm = None
    try:
        m = re.search(r'"avgt[^"]*"\s*:\s*([\d.]+)', sys_p)
        if m:
            avg_t = float(m.group(1))
        m2 = re.search(r'"annualrain[^"]*"\s*:\s*([\d.]+)', sys_p)
        if m2:
            rain_mm = float(m2.group(1))
        m3 = re.search(r'"location"\s*:\s*"([^"]+)"', sys_p)
        if m3:
            loc_name = m3.group(1).title()
    except Exception:
        pass
    return loc_name, avg_t, rain_mm


def rule_based_reply(body: dict) -> str:
    loc_name, avg_t, rain_mm = _extract_context(body)
    msgs = body.get("messages") or []
    user_q = ""
    for m in reversed(msgs):
        if m.get("role") == "user":
            user_q = (m.get("content") or "").lower()
            break

    for crop, info in _CROP_CALENDAR.items():
        if crop in user_q:
            advice = (
                f"**{crop.title()} Farming Guide for {loc_name}**\n\n"
                f"Sowing Season : {info['sow']}\n"
                f"Harvest Season: {info['harvest']}\n"
                f"Water Needed  : ~{info['water_mm']} mm/season\n"
                f"Ideal Temp    : {info['temp_c']}°C\n"
                f"Notes         : {info['notes']}\n"
            )
            if avg_t is not None:
                if avg_t < 10:
                    advice += f"\n{loc_name} avg temp ({avg_t}°C) is quite cold — consider cold-tolerant varieties."
                elif avg_t > 35:
                    advice += f"\n{loc_name} avg temp ({avg_t}°C) is very hot — heat-tolerant varieties critical."
                else:
                    advice += f"\n{loc_name} avg temp ({avg_t}°C) is suitable for this crop."
            if rain_mm is not None:
                if rain_mm < info["water_mm"] * 0.4:
                    advice += f"\nAnnual rain (~{rain_mm:.0f}mm) is below crop water need — supplemental irrigation required."
                elif rain_mm >= info["water_mm"]:
                    advice += f"\nAnnual rain (~{rain_mm:.0f}mm) may meet most water needs — monitor drainage."
            return advice

    if any(w in user_q for w in ["farm", "crop", "agri", "grow", "plant", "irrigat", "harvest", "sow", "cultivat"]):
        crops_list = ", ".join(c.title() for c in _CROP_CALENDAR)
        reply = (
            f"**Farming Advisory for {loc_name}**\n\n"
            f"I can provide guidance for: {crops_list}.\n"
            f"Ask about a specific crop for sowing/harvest calendar, water requirements, and temperature suitability.\n"
        )
        if avg_t is not None and rain_mm is not None:
            reply += f"\nCurrent summary: Avg temp {avg_t}°C · Annual rain ~{rain_mm:.0f}mm"
        return reply

    if any(w in user_q for w in ["temp", "hot", "cold", "degree", "warmest", "coolest", "heat", "freeze"]):
        if avg_t is not None:
            season = "hot" if avg_t > 28 else ("warm" if avg_t > 20 else ("mild" if avg_t > 12 else "cold"))
            return (
                f"**Temperature — {loc_name}**\n\n"
                f"Mean annual temperature: {avg_t}°C ({season} climate).\n\n"
                "Pakistan climate zones:\n"
                "  >30°C avg — arid/semi-arid (Sindh, S. Punjab)\n"
                "  20–30°C   — semi-arid/sub-humid (Central Punjab, KP plains)\n"
                "  10–20°C   — sub-humid/humid (Northern areas, AJK)\n"
                "  <10°C     — highland/alpine (GB, upper KP)\n"
            )
        return f"Temperature data for {loc_name} will appear after you fetch climate data."

    if any(w in user_q for w in ["rain", "monsoon", "flood", "drought", "precipit", "water", "dry", "wet"]):
        if rain_mm is not None:
            cat = (
                "very arid (<100mm)"    if rain_mm < 100 else
                "arid (100–250mm)"      if rain_mm < 250 else
                "semi-arid (250–500mm)" if rain_mm < 500 else
                "sub-humid (500–800mm)" if rain_mm < 800 else
                "humid (>800mm)"
            )
            return (
                f"**Rainfall — {loc_name}**\n\n"
                f"Avg annual rainfall: {rain_mm:.0f} mm — classified as {cat}.\n\n"
                "Pakistan monsoon (Jul–Sep) typically brings 60–80% of annual rain.\n"
                "Winter rains (Jan–Mar): Western disturbances affect N. Punjab, KP, Balochistan.\n"
            )
        return f"Load climate data first (Fetch button), then ask about rainfall patterns for {loc_name}."

    if any(w in user_q for w in ["wind", "gust", "breeze", "storm"]):
        return (
            f"**Wind — {loc_name}**\n\n"
            "Pakistan wind patterns:\n"
            "  Summer: Hot Loo winds (May–Jun) in Punjab/Sindh — 40–60 km/h gusts\n"
            "  Monsoon: South-westerly moist winds (Jul–Sep)\n"
            "  Winter: Cold northwesterlies from Afghanistan/Iran\n"
            "  Coastal: Sea breezes in Karachi (Arabian Sea)\n"
        )

    if any(w in user_q for w in ["risk", "disast", "flood", "heatwave", "drought", "earthquake", "landslid"]):
        return (
            f"**Disaster Risk — {loc_name}**\n\n"
            "Pakistan major climate hazards:\n"
            "  Floods    — Monsoon flash floods (Jul–Sep), Indus River flooding\n"
            "  Heatwaves — May–Jun in Sindh/S.Punjab (>45°C recorded)\n"
            "  Droughts  — Extended dry spells in Balochistan/Sindh\n"
            "  Cold waves — Dec–Jan in northern highlands\n"
        )

    if avg_t is not None:
        rain_line = f"  Annual rain : {rain_mm:.0f}mm\n" if rain_mm else ""
        return (
            f"**Climate Overview — {loc_name}**\n\n"
            f"  Mean temp   : {avg_t}°C\n"
            f"{rain_line}"
            "Pakistan has 5 major climate zones: arid, semi-arid, sub-humid, humid, and alpine.\n"
            "Ask about temperature, rainfall, wind, or a specific crop."
        )

    return (
        f"**PakClim AI Assistant** for {loc_name}\n\n"
        "Ask about:\n"
        "  Temperature analysis\n"
        "  Rainfall & monsoon patterns\n"
        "  Wind & humidity insights\n"
        "  Crop & farming advice (wheat, rice, cotton, mango + more)\n"
        "  Disaster risk (flood, drought, heatwave)\n\n"
        "Select a district on the map, fetch climate data, then ask anything!"
    )


async def call_claude(api_key: str, body: dict) -> dict:
    payload = {
        "model":      body.get("model", "claude-sonnet-4-6"),
        "max_tokens": min(int(body.get("max_tokens", 1024)), 4096),
        "messages":   body.get("messages", []),
    }
    if body.get("system"):
        payload["system"] = body["system"]

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers={
                "x-api-key":         api_key,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()
