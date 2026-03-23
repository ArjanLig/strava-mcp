import os
import sys
import asyncio
from datetime import datetime, timedelta
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# Suppress stravalib warnings about missing env vars (we use config file instead)
os.environ["SILENCE_TOKEN_WARNINGS"] = "true"

from stravalib.client import Client
from stravalib.exc import AccessUnauthorized
from strava_mcp.config import get_credentials, update_tokens


def get_authenticated_client():
    """Create authenticated client with auto token refresh"""
    creds = get_credentials()

    client = Client()
    client.access_token = creds["access_token"]

    try:
        client.get_athlete()
        return client
    except AccessUnauthorized:
        print("Token expired, refreshing...", file=sys.stderr)
        token_response = client.refresh_access_token(
            client_id=creds["client_id"],
            client_secret=creds["client_secret"],
            refresh_token=creds["refresh_token"],
        )

        update_tokens(
            token_response["access_token"],
            token_response["refresh_token"],
        )

        client.access_token = token_response["access_token"]
        return client


# ============= TRAINING LOAD FUNCTIONS =============


def calculate_training_loads(activities, days_atl=7, days_ctl=42):
    """
    Calculate ATL, CTL and TSB
    ATL (Acute Training Load) = short-term fatigue (7 days)
    CTL (Chronic Training Load) = long-term fitness (42 days)
    TSB (Training Stress Balance) = CTL - ATL (form indicator)
    """
    now = datetime.now()
    daily_loads = {}

    for activity in activities:
        activity_date = activity.start_date_local.replace(tzinfo=None).date()
        days_ago = (now.date() - activity_date).days

        if days_ago > days_ctl:
            continue

        suffer_score = activity.suffer_score if activity.suffer_score else 0

        if activity_date not in daily_loads:
            daily_loads[activity_date] = 0
        daily_loads[activity_date] += suffer_score

    # Calculate ATL (last 7 days average)
    atl_sum = 0
    for i in range(days_atl):
        date = (now - timedelta(days=i)).date()
        if date in daily_loads:
            atl_sum += daily_loads[date]

    atl = atl_sum / days_atl if days_atl > 0 else 0

    # Calculate CTL (last 42 days average)
    ctl_sum = 0
    for i in range(days_ctl):
        date = (now - timedelta(days=i)).date()
        if date in daily_loads:
            ctl_sum += daily_loads[date]

    ctl = ctl_sum / days_ctl if days_ctl > 0 else 0

    tsb = ctl - atl

    return {
        "atl": round(atl, 1),
        "ctl": round(ctl, 1),
        "tsb": round(tsb, 1),
        "daily_loads": daily_loads,
    }


def get_training_recommendation(tsb, atl, ctl):
    """Get training recommendation based on TSB"""
    if tsb < -30:
        status = "REST"
        advice = "You are very fatigued. Take at least 1-2 rest days. Your body needs recovery."
        intensity = "Rest or very light recovery ride (<60%% FTP)"
    elif tsb < -10:
        status = "EASY"
        advice = "You are slightly fatigued. Train light or take a rest day. No intense workouts."
        intensity = "Zone 1-2 recovery rides, max 60-90 min"
    elif tsb < 5:
        status = "MODERATE"
        advice = "Good balance! You can train normally with moderate intensity."
        intensity = "Zone 2-3 endurance, tempo intervals possible"
    elif tsb < 25:
        status = "HARD"
        advice = "You are fresh and well-recovered! Perfect for intense training."
        intensity = "VO2max intervals, threshold work, race efforts"
    else:
        status = "DETRAINING RISK"
        advice = "You haven't trained intensely in a while. Increase your training load gradually."
        intensity = "Build volume and intensity slowly"

    fitness_context = ""
    if ctl < 30:
        fitness_context = "Your base fitness is low. Focus on building volume."
    elif ctl < 60:
        fitness_context = "You have a solid base fitness."
    else:
        fitness_context = "You have a high fitness level! Keep it up."

    return {
        "status": status,
        "advice": advice,
        "intensity": intensity,
        "fitness_context": fitness_context,
    }


def calculate_weekly_trends(daily_loads, weeks=8):
    """Calculate ATL and CTL per week for trend analysis"""
    now = datetime.now()
    weekly_trends = []

    for week_offset in range(weeks):
        week_end = now - timedelta(days=week_offset * 7)

        atl_sum = 0
        for i in range(7):
            date = (week_end - timedelta(days=i)).date()
            if date in daily_loads:
                atl_sum += daily_loads[date]
        atl = atl_sum / 7

        ctl_sum = 0
        for i in range(42):
            date = (week_end - timedelta(days=i)).date()
            if date in daily_loads:
                ctl_sum += daily_loads[date]
        ctl = ctl_sum / 42

        weekly_trends.append(
            {
                "week_offset": week_offset,
                "week_label": f"Week -{week_offset}" if week_offset > 0 else "This week",
                "atl": round(atl, 1),
                "ctl": round(ctl, 1),
                "tsb": round(ctl - atl, 1),
            }
        )

    return list(reversed(weekly_trends))


def calculate_ramp_rate(weekly_trends):
    """
    Calculate ramp rate (%% change in load week-over-week)
    Safe: 5-10%% per week
    Risk: >10%% per week
    """
    if len(weekly_trends) < 2:
        return None

    current_week = weekly_trends[-1]
    previous_week = weekly_trends[-2]

    if previous_week["atl"] == 0:
        return None

    ramp_rate = ((current_week["atl"] - previous_week["atl"]) / previous_week["atl"]) * 100

    if ramp_rate > 15:
        status = "TOO FAST"
        warning = "WARNING: Load increased >15%% — high injury risk!"
    elif ramp_rate > 10:
        status = "FAST"
        warning = "Caution: Load increased >10%% — monitor fatigue closely"
    elif ramp_rate > 5:
        status = "GOOD"
        warning = "Healthy progression — load increasing steadily"
    elif ramp_rate > -5:
        status = "STABLE"
        warning = "Load is stable — good maintenance"
    else:
        status = "DECLINING"
        warning = "Load is declining — recovery period or detraining?"

    return {
        "rate": round(ramp_rate, 1),
        "status": status,
        "warning": warning,
        "current_atl": current_week["atl"],
        "previous_atl": previous_week["atl"],
    }


def generate_weekly_recommendation(tsb, atl, ctl, ramp_rate_data):
    """Generate a weekly training plan"""
    current_weekly_hours = (atl * 7) / 60

    if ramp_rate_data and ramp_rate_data["rate"] > 10:
        target_hours = current_weekly_hours * 0.9
        volume_advice = "Reduce volume by 10%% (ramp rate too high)"
    elif tsb < -30:
        target_hours = current_weekly_hours * 0.7
        volume_advice = "Reduce volume by 30%% (recovery needed)"
    elif tsb < -10:
        target_hours = current_weekly_hours * 0.85
        volume_advice = "Reduce volume by 15%% (recovery week)"
    elif tsb > 15:
        target_hours = current_weekly_hours * 1.08
        volume_advice = "Increase volume by 8%% (good form for building)"
    elif tsb > 5:
        target_hours = current_weekly_hours * 1.05
        volume_advice = "Increase volume by 5%% (safe progression)"
    else:
        target_hours = current_weekly_hours
        volume_advice = "Maintain current volume (good balance)"

    if tsb < -30:
        plan = {"endurance": 2, "recovery": 2, "intervals": 0, "rest": 3}
        intensity_note = "Focus on recovery — light rides only"
    elif tsb < -10:
        plan = {"endurance": 2, "recovery": 2, "intervals": 0, "rest": 3}
        intensity_note = "Recovery week — no intense workouts"
    elif tsb < 5:
        plan = {"endurance": 3, "tempo": 1, "recovery": 1, "rest": 2}
        intensity_note = "Balanced week - endurance + 1x tempo"
    elif tsb < 15:
        plan = {"endurance": 2, "tempo": 1, "intervals": 1, "recovery": 1, "rest": 2}
        intensity_note = "Build week — endurance + intensity possible"
    else:
        plan = {"endurance": 2, "intervals": 2, "recovery": 1, "rest": 2}
        intensity_note = "High intensity week — you're fresh enough!"

    return {
        "target_hours": round(target_hours, 1),
        "current_hours": round(current_weekly_hours, 1),
        "volume_advice": volume_advice,
        "plan": plan,
        "intensity_note": intensity_note,
    }


# ============= POWER CURVE FUNCTIONS =============


def find_best_power(watts_list, duration_seconds):
    """Find best average power for a given duration window"""
    if len(watts_list) < duration_seconds:
        return 0
    best = 0
    # Use rolling sum for efficiency
    window_sum = sum(watts_list[:duration_seconds])
    best = window_sum
    for i in range(1, len(watts_list) - duration_seconds):
        window_sum += watts_list[i + duration_seconds - 1] - watts_list[i - 1]
        best = max(best, window_sum)
    return round(best / duration_seconds)


def get_power_streams(client, activity_id):
    """Get watts stream for an activity. Returns list of watts or None."""
    try:
        streams = client.get_activity_streams(
            activity_id, types=["watts"], resolution="high"
        )
        if streams and "watts" in streams:
            return streams["watts"].data
    except Exception:
        pass
    return None


# ============= HR ZONE FUNCTIONS =============


def calculate_hr_zones(max_hr):
    """Calculate HR zone boundaries from max HR"""
    return {
        1: (0, int(max_hr * 0.70)),
        2: (int(max_hr * 0.70), int(max_hr * 0.80)),
        3: (int(max_hr * 0.80), int(max_hr * 0.87)),
        4: (int(max_hr * 0.87), int(max_hr * 0.93)),
        5: (int(max_hr * 0.93), 999),
    }


def get_hr_stream(client, activity_id):
    """Get heartrate stream for an activity. Returns list of HR values or None."""
    try:
        streams = client.get_activity_streams(
            activity_id, types=["heartrate"], resolution="low"
        )
        if streams and "heartrate" in streams:
            return streams["heartrate"].data
    except Exception:
        pass
    return None


def classify_hr_to_zones(hr_data, zones):
    """Count seconds in each HR zone"""
    zone_seconds = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for hr in hr_data:
        for zone_num, (low, high) in zones.items():
            if low <= hr < high:
                zone_seconds[zone_num] += 1
                break
    return zone_seconds


def format_duration_hm(seconds):
    """Format seconds to H:MM format"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    return f"{h}:{m:02d}"


def make_bar(pct, width=10):
    """Make a simple text progress bar"""
    filled = round(pct / 100 * width)
    return "█" * filled + "░" * (width - filled)


# ============= HR DRIFT FUNCTIONS =============


def calculate_hr_drift(hr_data):
    """
    Calculate cardiac drift: compare avg HR of first 25% vs last 25%.
    Returns drift percentage.
    """
    n = len(hr_data)
    if n < 20:
        return None
    quarter = n // 4
    first_avg = sum(hr_data[:quarter]) / quarter
    last_avg = sum(hr_data[-quarter:]) / quarter
    if first_avg == 0:
        return None
    return round(((last_avg / first_avg) - 1) * 100, 1)


def drift_rating(drift_pct):
    """Rate drift percentage"""
    if drift_pct is None:
        return "❓", "onbekend"
    if drift_pct < 5:
        return "✅", "uitstekend"
    elif drift_pct < 10:
        return "🟡", "redelijk"
    else:
        return "🔴", "hoog"


# ============= WORKOUT QUALITY FUNCTIONS =============


def detect_intervals(watts_data, min_duration=120):
    """
    Detect intervals in power data.
    An interval = sustained effort >20% above overall average for >min_duration seconds.
    Returns list of dicts with start, end, watts list.
    """
    if not watts_data or len(watts_data) < min_duration:
        return []

    overall_avg = sum(watts_data) / len(watts_data)
    threshold = overall_avg * 1.20

    intervals = []
    in_interval = False
    start = 0

    for i, w in enumerate(watts_data):
        if w >= threshold and not in_interval:
            in_interval = True
            start = i
        elif w < threshold and in_interval:
            in_interval = False
            duration = i - start
            if duration >= min_duration:
                intervals.append({
                    "start": start,
                    "end": i,
                    "watts": watts_data[start:i],
                })
            # Reset for next interval
        # Handle edge: interval runs to end
    if in_interval:
        duration = len(watts_data) - start
        if duration >= min_duration:
            intervals.append({
                "start": start,
                "end": len(watts_data),
                "watts": watts_data[start:],
            })

    return intervals


def interval_stats(watts):
    """Calculate stats for an interval"""
    if not watts:
        return {"avg": 0, "cv": 0}
    avg = sum(watts) / len(watts)
    if avg == 0:
        return {"avg": 0, "cv": 0}
    variance = sum((w - avg) ** 2 for w in watts) / len(watts)
    std_dev = variance ** 0.5
    cv = (std_dev / avg) * 100
    return {"avg": round(avg), "cv": round(cv, 1)}


# Lazy client initialization
_client = None


def get_client():
    """Get or initialize the authenticated Strava client (lazy init)"""
    global _client
    if _client is None:
        _client = get_authenticated_client()
    return _client


# Create MCP server
server = Server("strava-mcp")


@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available Strava tools"""
    return [
        Tool(
            name="get_recent_activities",
            description="Get recent Strava activities (default: last 10)",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "number",
                        "description": "Number of activities (max 30)",
                        "default": 10,
                    }
                },
            },
        ),
        Tool(
            name="get_activity_details",
            description="Get detailed info for a specific activity",
            inputSchema={
                "type": "object",
                "properties": {
                    "activity_id": {
                        "type": "string",
                        "description": "Activity ID",
                    }
                },
                "required": ["activity_id"],
            },
        ),
        Tool(
            name="get_weekly_stats",
            description="Weekly training statistics (distance, time, training load)",
            inputSchema={
                "type": "object",
                "properties": {
                    "weeks": {
                        "type": "number",
                        "description": "Number of weeks back (default: 4)",
                        "default": 4,
                    }
                },
            },
        ),
        Tool(
            name="get_training_load_analysis",
            description="Analyze training load with ATL, CTL, TSB and get REST or TRAIN advice",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="get_weekly_training_plan",
            description="Get a weekly plan with recommended hours, workout types and intensities based on your current status",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="get_gear_maintenance",
            description="List all bikes and shoes with total km and maintenance warnings",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="get_power_curve",
            description="Analyze best power outputs (5s, 1min, 5min, 20min, 60min), estimate FTP, and compare with previous month",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="get_hr_zone_distribution",
            description="Analyze time spent in each HR zone (last 4 weeks) with training balance advice",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="get_hr_drift_analysis",
            description="Measure cardiac drift in steady rides — indicator of aerobic efficiency",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="check_workout_quality",
            description="Analyze interval consistency, power decoupling, and recovery for a specific activity",
            inputSchema={
                "type": "object",
                "properties": {
                    "activity_id": {
                        "type": "string",
                        "description": "Activity ID to analyze",
                    }
                },
                "required": ["activity_id"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Execute tool"""

    try:
        if name == "get_recent_activities":
            limit = min(int(arguments.get("limit", 10)), 30)
            activities = get_client().get_activities(limit=limit)

            result = "RECENT ACTIVITIES\n\n"
            for activity in activities:
                date = activity.start_date_local.strftime("%d-%m-%Y %H:%M")
                distance = round(float(activity.distance) / 1000, 1) if activity.distance else 0
                total_secs = int(activity.moving_time.total_seconds()) if hasattr(activity.moving_time, 'total_seconds') else int(activity.moving_time)
                hours, remainder = divmod(total_secs, 3600)
                mins, secs = divmod(remainder, 60)
                duration = f"{hours}:{mins:02d}:{secs:02d}" if hours else f"{mins}:{secs:02d}"

                result += f"{date}\n"
                result += f"   {activity.name}\n"
                result += f"   {distance} km | {duration}\n"
                if activity.average_heartrate:
                    result += f"   {int(activity.average_heartrate)} bpm avg\n"
                result += f"   ID: {activity.id}\n\n"

            return [TextContent(type="text", text=result)]

        elif name == "get_activity_details":
            activity_id = arguments["activity_id"]
            try:
                activity_id = int(activity_id)
            except (ValueError, TypeError):
                return [TextContent(type="text", text="Invalid activity ID. Must be a numeric value.")]

            activity = get_client().get_activity(activity_id)

            result = f"ACTIVITY DETAILS\n\n"
            result += f"Name: {activity.name}\n"
            result += f"Date: {activity.start_date_local.strftime('%d-%m-%Y %H:%M')}\n"
            result += f"Distance: {round(float(activity.distance) / 1000, 1)} km\n"
            result += f"Time: {activity.moving_time}\n"
            result += f"Avg Speed: {round(float(activity.average_speed) * 3.6, 1)} km/h\n"

            if activity.average_heartrate:
                result += f"Avg HR: {int(activity.average_heartrate)} bpm\n"
            if activity.max_heartrate:
                result += f"Max HR: {int(activity.max_heartrate)} bpm\n"
            if activity.average_watts:
                result += f"Avg Power: {int(activity.average_watts)}W\n"
            if activity.suffer_score:
                result += f"Suffer Score: {activity.suffer_score}\n"

            result += f"\nDescription: {activity.description or 'No description'}\n"

            return [TextContent(type="text", text=result)]

        elif name == "get_weekly_stats":
            weeks = min(int(arguments.get("weeks", 4)), 52)
            activities = get_client().get_activities(limit=200)

            weekly_data = {}
            now = datetime.now()

            for activity in activities:
                activity_date = activity.start_date_local.replace(tzinfo=None)
                week_num = (now - activity_date).days // 7

                if week_num >= weeks:
                    continue

                week_label = f"Week -{week_num}" if week_num > 0 else "This week"

                if week_label not in weekly_data:
                    weekly_data[week_label] = {
                        "distance": 0,
                        "time": timedelta(),
                        "activities": 0,
                    }

                weekly_data[week_label]["distance"] += float(activity.distance) / 1000

                if activity.moving_time:
                    weekly_data[week_label]["time"] += activity.moving_time

                weekly_data[week_label]["activities"] += 1

            result = f"WEEKLY STATISTICS (last {weeks} weeks)\n\n"

            for week in sorted(weekly_data.keys(), reverse=True):
                data = weekly_data[week]
                hours = data["time"].total_seconds() / 3600

                result += f"{week}:\n"
                result += f"  {data['activities']} rides\n"
                result += f"  {round(data['distance'], 1)} km\n"
                result += f"  {round(hours, 1)} hours\n\n"

            return [TextContent(type="text", text=result)]

        elif name == "get_training_load_analysis":
            activities = list(get_client().get_activities(limit=200))

            loads = calculate_training_loads(activities)
            recommendation = get_training_recommendation(loads["tsb"], loads["atl"], loads["ctl"])
            weekly_trends = calculate_weekly_trends(loads["daily_loads"], weeks=8)
            ramp_rate = calculate_ramp_rate(weekly_trends)

            result = "TRAINING LOAD ANALYSIS\n\n"
            result += f"CURRENT STATUS\n"
            result += f"ATL (Acute - 7 days): {loads['atl']}\n"
            result += f"CTL (Chronic - 42 days): {loads['ctl']}\n"
            result += f"TSB (Balance): {loads['tsb']}\n\n"

            if ramp_rate:
                result += f"RAMP RATE (week-over-week)\n"
                result += f"{ramp_rate['status']}: {ramp_rate['rate']:+.1f}%\n"
                result += f"Previous week ATL: {ramp_rate['previous_atl']}\n"
                result += f"This week ATL: {ramp_rate['current_atl']}\n"
                result += f"{ramp_rate['warning']}\n\n"

            result += f"ADVICE: {recommendation['status']}\n"
            result += f"{recommendation['advice']}\n\n"
            result += f"Recommended intensity:\n{recommendation['intensity']}\n\n"
            result += f"Fitness context:\n{recommendation['fitness_context']}\n\n"

            result += f"WEEKLY TRENDS (last 8 weeks)\n"
            result += f"{'Week':<12} {'ATL':>6} {'CTL':>6} {'TSB':>6}\n"
            result += f"{'-' * 12} {'-' * 6} {'-' * 6} {'-' * 6}\n"

            for trend in weekly_trends[-8:]:
                result += f"{trend['week_label']:<12} {trend['atl']:>6.1f} {trend['ctl']:>6.1f} {trend['tsb']:>6.1f}\n"

            return [TextContent(type="text", text=result)]

        elif name == "get_weekly_training_plan":
            activities = list(get_client().get_activities(limit=200))

            loads = calculate_training_loads(activities)
            weekly_trends = calculate_weekly_trends(loads["daily_loads"], weeks=8)
            ramp_rate = calculate_ramp_rate(weekly_trends)

            plan = generate_weekly_recommendation(loads["tsb"], loads["atl"], loads["ctl"], ramp_rate)

            result = "WEEKLY TRAINING PLAN\n\n"
            result += f"VOLUME ADVICE\n"
            result += f"Current week: ~{plan['current_hours']} hrs\n"
            result += f"Recommended: ~{plan['target_hours']} hrs\n"
            result += f"{plan['volume_advice']}\n\n"

            result += f"WORKOUT MIX\n"
            for workout_type, count in plan["plan"].items():
                result += f"{workout_type.capitalize()}: {count}x\n"

            result += f"\n{plan['intensity_note']}\n"

            return [TextContent(type="text", text=result)]

        elif name == "get_gear_maintenance":
            athlete = get_client().get_athlete()

            THRESHOLDS = {
                "chain": 3000,
                "cassette": 6000,
                "tires": 5000,
                "cables": 8000,
            }

            result = "🔧 GEAR MAINTENANCE\n\n"

            bikes = athlete.bikes or []
            shoes = athlete.shoes or []

            if bikes:
                result += "🚴 FIETSEN\n\n"
                for bike in bikes:
                    km = round(float(bike.distance) / 1000, 0)
                    result += f"{bike.name}\n"
                    result += f"   📏 {km:,.0f} km\n"

                    warnings = []
                    if km >= THRESHOLDS["cassette"]:
                        warnings.append(f"   🔴 Cassette vervangen aanbevolen (>{THRESHOLDS['cassette']}km)")
                    if km >= THRESHOLDS["tires"]:
                        warnings.append(f"   ⚠️ Banden check aanbevolen (>{THRESHOLDS['tires']}km)")
                    if km >= THRESHOLDS["chain"]:
                        warnings.append(f"   ⚠️ Ketting service aanbevolen (>{THRESHOLDS['chain']}km)")
                    if km >= THRESHOLDS["cables"]:
                        warnings.append(f"   ⚠️ Kabels check aanbevolen (>{THRESHOLDS['cables']}km)")

                    if warnings:
                        result += "\n".join(warnings) + "\n"
                    else:
                        result += "   ✅ Geen service nodig\n"
                    result += "\n"

            if shoes:
                result += "👟 SCHOENEN\n\n"
                for shoe in shoes:
                    km = round(float(shoe.distance) / 1000, 0)
                    result += f"{shoe.name}\n"
                    result += f"   📏 {km:,.0f} km\n"
                    if km >= 800:
                        result += f"   ⚠️ Overweeg nieuwe schoenen (>{km:.0f}km)\n"
                    else:
                        result += "   ✅ Goed\n"
                    result += "\n"

            if not bikes and not shoes:
                result += "Geen gear gevonden in je Strava profiel.\n"

            result += "💡 TIPS\n"
            result += f"   Ketting: elke {THRESHOLDS['chain']}km\n"
            result += f"   Cassette: elke {THRESHOLDS['cassette']}km\n"
            result += f"   Banden: elke {THRESHOLDS['tires']}km of bij slijtage\n"
            result += f"   Kabels: elke {THRESHOLDS['cables']}km\n"

            return [TextContent(type="text", text=result)]

        elif name == "get_power_curve":
            client = get_client()
            now = datetime.now()
            cutoff_this_month = now - timedelta(days=30)
            cutoff_prev_month = now - timedelta(days=60)

            DURATIONS = [
                (5, "5s", "sprint power"),
                (60, "1min", "anaerobic capacity"),
                (300, "5min", "VO2max"),
                (1200, "20min", "FTP basis"),
                (3600, "60min", "threshold"),
            ]

            # Collect best powers for this month and previous month
            best_this = {d: 0 for d, _, _ in DURATIONS}
            best_prev = {d: 0 for d, _, _ in DURATIONS}

            activities = list(client.get_activities(limit=200))
            power_found = False

            for activity in activities:
                act_date = activity.start_date_local.replace(tzinfo=None)
                if act_date < cutoff_prev_month:
                    continue

                watts = get_power_streams(client, activity.id)
                if not watts:
                    continue
                power_found = True

                for duration_s, _, _ in DURATIONS:
                    bp = find_best_power(watts, duration_s)
                    if act_date >= cutoff_this_month:
                        best_this[duration_s] = max(best_this[duration_s], bp)
                    else:
                        best_prev[duration_s] = max(best_prev[duration_s], bp)

            if not power_found:
                return [TextContent(type="text", text="⚠️ Geen power data gevonden in recente activities.\nZorg ervoor dat je een power meter gebruikt.")]

            result = "⚡ POWER CURVE ANALYSE\n\n"
            result += "📊 BEST POWER OUTPUTS\n"
            for duration_s, label, desc in DURATIONS:
                w = best_this[duration_s]
                result += f"   {label:>5s}: {w:>5,}W  ({desc})\n"

            # FTP estimation
            ftp = round(best_this[1200] * 0.95)
            result += f"\n🎯 GESCHATTE FTP\n"
            result += f"   FTP: {ftp}W (95%% van 20min power)\n"

            # Get athlete weight for W/kg
            athlete = client.get_athlete()
            if athlete.weight and athlete.weight > 0:
                wkg = round(ftp / float(athlete.weight), 1)
                result += f"   W/kg: {wkg} (bij {float(athlete.weight):.0f}kg)\n"

            # Month comparison
            has_prev = any(best_prev[d] > 0 for d, _, _ in DURATIONS)
            if has_prev:
                result += "\n📈 VERGELIJKING VORIGE MAAND\n"
                for duration_s, label, _ in DURATIONS:
                    cur = best_this[duration_s]
                    prev = best_prev[duration_s]
                    if prev > 0 and cur > 0:
                        diff = cur - prev
                        pct = (diff / prev) * 100
                        icon = "🟢" if diff >= 0 else "🔴"
                        result += f"   {label:>5s}: {diff:+d}W ({pct:+.1f}%%) {icon}\n"

            return [TextContent(type="text", text=result)]

        elif name == "get_hr_zone_distribution":
            client = get_client()
            now = datetime.now()
            cutoff = now - timedelta(days=28)

            activities = list(client.get_activities(limit=100))
            recent = [
                a for a in activities
                if a.start_date_local.replace(tzinfo=None) >= cutoff
            ]

            if not recent:
                return [TextContent(type="text", text="⚠️ Geen activities gevonden in de laatste 4 weken.")]

            # Estimate max HR from data
            max_hr_observed = 0
            for a in recent:
                if a.max_heartrate:
                    max_hr_observed = max(max_hr_observed, int(a.max_heartrate))

            if max_hr_observed == 0:
                return [TextContent(type="text", text="⚠️ Geen hartslag data gevonden in recente activities.\nGebruik je een HR monitor?")]

            max_hr = max_hr_observed
            zones = calculate_hr_zones(max_hr)
            total_zone_seconds = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}

            hr_found = False
            for activity in recent:
                hr_data = get_hr_stream(client, activity.id)
                if not hr_data:
                    continue
                hr_found = True
                zone_secs = classify_hr_to_zones(hr_data, zones)
                for z in range(1, 6):
                    total_zone_seconds[z] += zone_secs[z]

            if not hr_found:
                return [TextContent(type="text", text="⚠️ Geen HR stream data beschikbaar voor recente activities.")]

            total_seconds = sum(total_zone_seconds.values())
            if total_seconds == 0:
                return [TextContent(type="text", text="⚠️ Geen HR data om te analyseren.")]

            ZONE_NAMES = {
                1: "recovery",
                2: "endurance",
                3: "tempo",
                4: "threshold",
                5: "VO2max",
            }

            result = "❤️ HR ZONE DISTRIBUTIE (laatste 4 weken)\n\n"
            result += f"   Max HR gebruikt: {max_hr} bpm\n\n"
            result += "⏱️ TIJD PER ZONE\n"

            for z in range(1, 6):
                secs = total_zone_seconds[z]
                pct = (secs / total_seconds) * 100 if total_seconds > 0 else 0
                bar = make_bar(pct)
                result += f"   Zone {z} ({ZONE_NAMES[z]:>10s}): {format_duration_hm(secs):>6s} uur ({pct:4.0f}%%)  {bar}\n"

            result += f"\n   Totaal: {format_duration_hm(total_seconds)} uur\n"

            # Training balance advice
            z12_pct = ((total_zone_seconds[1] + total_zone_seconds[2]) / total_seconds) * 100
            z45_pct = ((total_zone_seconds[4] + total_zone_seconds[5]) / total_seconds) * 100
            z3_pct = (total_zone_seconds[3] / total_seconds) * 100

            result += "\n💡 TRAINING BALANCE\n"
            if 60 <= z12_pct <= 80:
                result += f"   ✅ Goede Z2 basis ({z12_pct:.0f}%% — ideaal 60-80%%)\n"
            elif z12_pct < 60:
                result += f"   ⚠️ Te weinig Z1/Z2 ({z12_pct:.0f}%% — aanbevolen 60-80%%)\n"
            else:
                result += f"   ⚠️ Veel Z1/Z2 ({z12_pct:.0f}%% — misschien meer intensiteit nodig)\n"

            if 10 <= z45_pct <= 20:
                result += f"   ✅ Goede intensiteit ({z45_pct:.0f}%% — ideaal 10-20%%)\n"
            elif z45_pct < 10:
                result += f"   ⚠️ Weinig Z4/Z5 intensiteit ({z45_pct:.0f}%% — aanbevolen 10-20%%)\n"
            else:
                result += f"   ⚠️ Veel intensiteit ({z45_pct:.0f}%% — risico op overtraining)\n"

            if z3_pct > 15:
                result += f"   ⚠️ Veel Z3 grey zone ({z3_pct:.0f}%% — probeer te polariseren)\n"

            result += "\n📋 ADVIES\n"
            if z45_pct < 10:
                result += "   Verhoog intensiteit: voeg 1-2 interval sessies toe per week\n"
            elif z12_pct < 60:
                result += "   Meer easy rides: bouw Z2 basis op voor duurzame progressie\n"
            elif z3_pct > 15:
                result += "   Polariseer meer: rij makkelijker OF harder, vermijd de grey zone\n"
            else:
                result += "   Goede verdeling! Blijf zo doorgaan.\n"

            return [TextContent(type="text", text=result)]

        elif name == "get_hr_drift_analysis":
            client = get_client()
            activities = list(client.get_activities(limit=50))

            # Filter steady rides >60 min
            long_rides = []
            for a in activities:
                moving_secs = int(a.moving_time.total_seconds()) if hasattr(a.moving_time, 'total_seconds') else int(a.moving_time)
                if moving_secs >= 3600:
                    long_rides.append(a)
                if len(long_rides) >= 10:
                    break

            if not long_rides:
                return [TextContent(type="text", text="⚠️ Geen ritten >60 minuten gevonden.\nHR drift analyse vereist langere rides.")]

            result = "📉 HR DRIFT ANALYSE\n\n"
            result += "📊 RECENTE RITTEN\n\n"

            drift_values = []

            for activity in long_rides:
                hr_data = get_hr_stream(client, activity.id)
                if not hr_data or len(hr_data) < 20:
                    continue

                drift = calculate_hr_drift(hr_data)
                if drift is None:
                    continue

                icon, rating = drift_rating(drift)
                quarter = len(hr_data) // 4
                start_hr = round(sum(hr_data[:quarter]) / quarter)
                end_hr = round(sum(hr_data[-quarter:]) / quarter)

                moving_secs = int(activity.moving_time.total_seconds()) if hasattr(activity.moving_time, 'total_seconds') else int(activity.moving_time)
                duration_h = moving_secs / 3600

                date_str = activity.start_date_local.strftime("%d %b")
                result += f"   {date_str} — {duration_h:.1f}u {activity.name}\n"
                result += f"   Drift: {drift:.1f}%% {icon} ({rating})\n"
                result += f"   Start HR: {start_hr} → Eind HR: {end_hr}\n\n"

                drift_values.append(drift)

            if not drift_values:
                return [TextContent(type="text", text="⚠️ Geen HR stream data beschikbaar voor langere ritten.")]

            # Trend
            avg_drift = sum(drift_values) / len(drift_values)
            result += "📈 TREND\n"
            result += f"   Gemiddelde drift: {avg_drift:.1f}%%\n"

            if len(drift_values) >= 4:
                first_half = sum(drift_values[:len(drift_values)//2]) / (len(drift_values)//2)
                second_half = sum(drift_values[len(drift_values)//2:]) / (len(drift_values) - len(drift_values)//2)
                trend = second_half - first_half
                trend_icon = "🟢" if trend < 0 else "🔴"
                trend_label = "verbeterend" if trend < 0 else "verslechterend"
                result += f"   Trend: {trend:+.1f}%% {trend_icon} ({trend_label})\n"

            result += "\n💡 INTERPRETATIE\n"
            result += "   <5%%:  Uitstekende aerobe efficiency ✅\n"
            result += "   5-10%%: Normaal 🟡\n"
            result += "   >10%%: Vermoeidheid of dehydratie 🔴\n"

            result += "\n🎯 ADVIES\n"
            if avg_drift < 5:
                result += "   Uitstekende aerobe basis! Blijf Z2 volume opbouwen.\n"
            elif avg_drift < 10:
                result += "   Normale drift. Meer Z2 endurance kan dit verbeteren.\n"
            else:
                result += "   Hoge drift. Focus op hydratatie en langere Z2 rides.\n"

            return [TextContent(type="text", text=result)]

        elif name == "check_workout_quality":
            activity_id = arguments["activity_id"]
            try:
                activity_id = int(activity_id)
            except (ValueError, TypeError):
                return [TextContent(type="text", text="Ongeldig activity ID. Moet een numerieke waarde zijn.")]

            client = get_client()
            activity = client.get_activity(activity_id)
            watts = get_power_streams(client, activity_id)

            if not watts or len(watts) < 300:
                return [TextContent(type="text", text="⚠️ Geen power data beschikbaar voor deze activity.\nWorkout quality check vereist een power meter.")]

            hr_data = get_hr_stream(client, activity_id)

            intervals = detect_intervals(watts)

            if not intervals:
                return [TextContent(type="text", text=f"⚠️ Geen intervals gedetecteerd in '{activity.name}'.\nDeze tool werkt het best met interval workouts.")]

            result = f"✅ WORKOUT QUALITY CHECK\n"
            result += f"   Activity: \"{activity.name}\"\n\n"
            result += "🔥 INTERVAL ANALYSE\n\n"

            all_cvs = []
            first_avg = None

            for i, interval in enumerate(intervals):
                stats = interval_stats(interval["watts"])
                duration_s = len(interval["watts"])
                mins = duration_s // 60
                secs = duration_s % 60

                if first_avg is None:
                    first_avg = stats["avg"]

                pct_vs_first = ((stats["avg"] / first_avg) - 1) * 100 if first_avg > 0 else 0
                pct_str = f" ({pct_vs_first:+.1f}%%)" if i > 0 else ""

                # CV rating
                if stats["cv"] < 5:
                    cv_icon = "✅"
                    cv_label = "zeer stabiel"
                elif stats["cv"] < 10:
                    cv_icon = "🟡"
                    cv_label = "redelijk"
                else:
                    cv_icon = "🔴"
                    cv_label = "variabel"

                result += f"   Interval {i+1}: {mins}:{secs:02d} @ {stats['avg']}W avg{pct_str}\n"
                result += f"   Consistency: {stats['cv']:.1f}%% {cv_icon} ({cv_label})\n"

                # HR if available
                if hr_data:
                    interval_hr = hr_data[interval["start"]:interval["end"]]
                    if interval_hr:
                        avg_hr = round(sum(interval_hr) / len(interval_hr))
                        result += f"   Avg HR: {avg_hr} bpm\n"

                result += "\n"
                all_cvs.append(stats["cv"])

            # Overall stats
            last_avg = interval_stats(intervals[-1]["watts"])["avg"]
            decoupling = ((last_avg / first_avg) - 1) * 100 if first_avg > 0 else 0

            if abs(decoupling) < 5:
                dec_icon = "✅"
            elif abs(decoupling) < 10:
                dec_icon = "🟡"
            else:
                dec_icon = "🔴"

            avg_cv = sum(all_cvs) / len(all_cvs) if all_cvs else 0
            if avg_cv < 5:
                cv_overall_icon = "✅"
            elif avg_cv < 10:
                cv_overall_icon = "🟡"
            else:
                cv_overall_icon = "🔴"

            result += "📊 OVERALL\n"
            result += f"   Power decoupling: {decoupling:+.1f}%% {dec_icon}\n"
            result += f"   (laatste vs eerste interval)\n"
            result += f"   Consistency gemiddeld: {avg_cv:.1f}%% {cv_overall_icon}\n"

            # Recovery check (HR between intervals)
            if hr_data and len(intervals) >= 2:
                result += "\n💤 RECOVERY CHECK\n"
                hr_drops = []
                for i in range(len(intervals) - 1):
                    end_idx = intervals[i]["end"]
                    next_start = intervals[i + 1]["start"]
                    if end_idx < len(hr_data) and next_start < len(hr_data):
                        peak_hr = max(hr_data[intervals[i]["start"]:intervals[i]["end"]])
                        recovery_hr = min(hr_data[end_idx:next_start]) if next_start > end_idx else peak_hr
                        hr_drops.append(peak_hr - recovery_hr)
                        recovery_secs = next_start - end_idx
                if hr_drops:
                    avg_drop = round(sum(hr_drops) / len(hr_drops))
                    drop_icon = "✅" if avg_drop >= 20 else "🟡" if avg_drop >= 10 else "🔴"
                    result += f"   HR daling: {avg_drop} bpm gemiddeld {drop_icon}\n"

            # Overall score
            score = 10.0
            if avg_cv > 5:
                score -= (avg_cv - 5) * 0.3
            if abs(decoupling) > 5:
                score -= (abs(decoupling) - 5) * 0.2
            score = max(1.0, min(10.0, round(score, 1)))

            result += f"\n💡 BEOORDELING\n"
            if decoupling < -5:
                result += "   Vermoeidheid zichtbaar in latere intervals.\n"
                result += "   Volgende keer: iets lager starten of recovery verlengen.\n"
            elif avg_cv > 10:
                result += "   Variabele power output. Probeer stabieler te rijden.\n"
            else:
                result += "   Goede uitvoering! Consistente intervals.\n"

            result += f"\n   ⭐ Overall score: {score}/10\n"

            return [TextContent(type="text", text=result)]

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

    except Exception as e:
        return [TextContent(type="text", text=f"Error executing {name}: {str(e)}")]


async def _run_server():
    """Start MCP server"""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


def main():
    """CLI entry point"""
    if "--auth" in sys.argv:
        from strava_mcp.auth import run_auth_flow

        run_auth_flow()
    else:
        asyncio.run(_run_server())


if __name__ == "__main__":
    main()
