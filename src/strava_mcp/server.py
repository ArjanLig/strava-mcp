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
