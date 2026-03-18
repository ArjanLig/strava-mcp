// strava-mcp-web/lib/tools.ts
import { Tool, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { getActivities, getActivity } from "./strava";
import {
  calculateTrainingLoads,
  getTrainingRecommendation,
  calculateWeeklyTrends,
  calculateRampRate,
  generateWeeklyRecommendation,
} from "./training";

export const tools: Tool[] = [
  {
    name: "get_recent_activities",
    description: "Get recent Strava activities (default: last 10)",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of activities (max 30)", default: 10 },
      },
    },
  },
  {
    name: "get_activity_details",
    description: "Get detailed info for a specific activity",
    inputSchema: {
      type: "object",
      properties: {
        activity_id: { type: "string", description: "Activity ID" },
      },
      required: ["activity_id"],
    },
  },
  {
    name: "get_weekly_stats",
    description: "Weekly training statistics (distance, time, training load)",
    inputSchema: {
      type: "object",
      properties: {
        weeks: { type: "number", description: "Number of weeks back (default: 4)", default: 4 },
      },
    },
  },
  {
    name: "get_training_load_analysis",
    description: "Analyze training load with ATL, CTL, TSB and get REST or TRAIN advice",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_weekly_training_plan",
    description: "Get a weekly plan with recommended hours, workout types and intensities",
    inputSchema: { type: "object", properties: {} },
  },
];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export async function handleTool(
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<TextContent[]> {
  try {
    if (name === "get_recent_activities") {
      const limit = Math.min(Number(args.limit || 10), 30);
      const activities = await getActivities(userId, limit);

      let result = "RECENT ACTIVITIES\n\n";
      for (const a of activities) {
        const date = new Date(a.start_date_local).toLocaleDateString("nl-NL", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
        const distance = (a.distance / 1000).toFixed(1);
        const duration = formatDuration(a.moving_time);
        result += `${date}\n   ${a.name}\n   ${distance} km | ${duration}\n`;
        if (a.average_heartrate) result += `   ${Math.round(a.average_heartrate)} bpm avg\n`;
        result += `   ID: ${a.id}\n\n`;
      }
      return [{ type: "text", text: result }];
    }

    if (name === "get_activity_details") {
      const id = Number(args.activity_id);
      if (isNaN(id)) return [{ type: "text", text: "Invalid activity ID." }];

      const a = await getActivity(userId, id);
      let result = `ACTIVITY DETAILS\n\nName: ${a.name}\n`;
      result += `Date: ${new Date(a.start_date_local).toLocaleDateString("nl-NL")}\n`;
      result += `Distance: ${(a.distance / 1000).toFixed(1)} km\n`;
      result += `Time: ${formatDuration(a.moving_time)}\n`;
      result += `Avg Speed: ${(a.average_speed * 3.6).toFixed(1)} km/h\n`;
      if (a.average_heartrate) result += `Avg HR: ${Math.round(a.average_heartrate)} bpm\n`;
      if (a.max_heartrate) result += `Max HR: ${Math.round(a.max_heartrate)} bpm\n`;
      if (a.average_watts) result += `Avg Power: ${Math.round(a.average_watts)}W\n`;
      if (a.suffer_score) result += `Suffer Score: ${a.suffer_score}\n`;
      result += `\nDescription: ${a.description || "No description"}\n`;
      return [{ type: "text", text: result }];
    }

    if (name === "get_weekly_stats") {
      const weeks = Math.min(Number(args.weeks || 4), 52);
      const activities = await getActivities(userId, 200);
      const now = new Date();
      const weeklyData: Record<string, { distance: number; time: number; activities: number }> = {};

      for (const a of activities) {
        const actDate = new Date(a.start_date_local);
        const weekNum = Math.floor((now.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
        if (weekNum >= weeks) continue;
        const label = weekNum === 0 ? "This week" : `Week -${weekNum}`;
        if (!weeklyData[label]) weeklyData[label] = { distance: 0, time: 0, activities: 0 };
        weeklyData[label].distance += a.distance / 1000;
        weeklyData[label].time += a.moving_time;
        weeklyData[label].activities += 1;
      }

      let result = `WEEKLY STATISTICS (last ${weeks} weeks)\n\n`;
      for (const week of Object.keys(weeklyData).sort().reverse()) {
        const d = weeklyData[week];
        result += `${week}:\n  ${d.activities} rides\n  ${d.distance.toFixed(1)} km\n  ${(d.time / 3600).toFixed(1)} hours\n\n`;
      }
      return [{ type: "text", text: result }];
    }

    if (name === "get_training_load_analysis") {
      const activities = await getActivities(userId, 200);
      const loads = calculateTrainingLoads(activities);
      const rec = getTrainingRecommendation(loads.tsb, loads.atl, loads.ctl);
      const trends = calculateWeeklyTrends(loads.dailyLoads, 8);
      const ramp = calculateRampRate(trends);

      let result = "TRAINING LOAD ANALYSIS\n\n";
      result += `CURRENT STATUS\nATL (Acute - 7 days): ${loads.atl}\nCTL (Chronic - 42 days): ${loads.ctl}\nTSB (Balance): ${loads.tsb}\n\n`;
      if (ramp) {
        result += `RAMP RATE\n${ramp.status}: ${ramp.rate > 0 ? "+" : ""}${ramp.rate}%\n${ramp.warning}\n\n`;
      }
      result += `ADVICE: ${rec.status}\n${rec.advice}\n\nIntensity: ${rec.intensity}\n${rec.fitnessContext}\n\n`;
      result += "WEEKLY TRENDS (last 8 weeks)\n";
      for (const t of trends) {
        result += `${t.weekLabel.padEnd(12)} ATL:${String(t.atl).padStart(6)} CTL:${String(t.ctl).padStart(6)} TSB:${String(t.tsb).padStart(6)}\n`;
      }
      return [{ type: "text", text: result }];
    }

    if (name === "get_weekly_training_plan") {
      const activities = await getActivities(userId, 200);
      const loads = calculateTrainingLoads(activities);
      const trends = calculateWeeklyTrends(loads.dailyLoads, 8);
      const ramp = calculateRampRate(trends);
      const plan = generateWeeklyRecommendation(loads.tsb, loads.atl, loads.ctl, ramp);

      let result = "WEEKLY TRAINING PLAN\n\n";
      result += `VOLUME ADVICE\nCurrent week: ~${plan.currentHours} hrs\nRecommended: ~${plan.targetHours} hrs\n${plan.volumeAdvice}\n\n`;
      result += "WORKOUT MIX\n";
      for (const [type, count] of Object.entries(plan.plan)) {
        result += `${type.charAt(0).toUpperCase() + type.slice(1)}: ${count}x\n`;
      }
      result += `\n${plan.intensityNote}\n`;
      return [{ type: "text", text: result }];
    }

    return [{ type: "text", text: `Unknown tool: ${name}` }];
  } catch (e: any) {
    return [{ type: "text", text: `Error: ${e.message}` }];
  }
}
