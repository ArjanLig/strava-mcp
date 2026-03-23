// strava-mcp-web/lib/tools.ts
import { Tool, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { getActivities, getActivity, getAthlete, getActivityStreams } from "./strava";
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
  {
    name: "get_gear_maintenance",
    description: "List all bikes and shoes with total km and maintenance warnings",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_power_curve",
    description: "Analyze best power outputs (5s, 1min, 5min, 20min, 60min), estimate FTP, and compare with previous month",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_hr_zone_distribution",
    description: "Analyze time spent in each HR zone (last 4 weeks) with training balance advice",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_hr_drift_analysis",
    description: "Measure cardiac drift in steady rides — indicator of aerobic efficiency",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "check_workout_quality",
    description: "Analyze interval consistency, power decoupling, and recovery for a specific activity",
    inputSchema: {
      type: "object",
      properties: {
        activity_id: { type: "string", description: "Activity ID to analyze" },
      },
      required: ["activity_id"],
    },
  },
];

function findBestPower(watts: number[], durationSeconds: number): number {
  if (watts.length < durationSeconds) return 0;
  let windowSum = 0;
  for (let i = 0; i < durationSeconds; i++) windowSum += watts[i];
  let best = windowSum;
  for (let i = 1; i <= watts.length - durationSeconds; i++) {
    windowSum += watts[i + durationSeconds - 1] - watts[i - 1];
    if (windowSum > best) best = windowSum;
  }
  return Math.round(best / durationSeconds);
}

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

    if (name === "get_gear_maintenance") {
      const athlete = await getAthlete(userId);
      const THRESHOLDS = { chain: 3000, cassette: 6000, tires: 5000, cables: 8000 };

      let result = "🔧 GEAR MAINTENANCE\n\n";

      const bikes = athlete.bikes || [];
      const shoes = athlete.shoes || [];

      if (bikes.length > 0) {
        result += "🚴 FIETSEN\n\n";
        for (const bike of bikes) {
          const km = Math.round(bike.distance / 1000);
          result += `${bike.name}\n   📏 ${km.toLocaleString()} km\n`;
          const warnings: string[] = [];
          if (km >= THRESHOLDS.cassette) warnings.push(`   🔴 Cassette vervangen aanbevolen (>${THRESHOLDS.cassette}km)`);
          if (km >= THRESHOLDS.tires) warnings.push(`   ⚠️ Banden check aanbevolen (>${THRESHOLDS.tires}km)`);
          if (km >= THRESHOLDS.chain) warnings.push(`   ⚠️ Ketting service aanbevolen (>${THRESHOLDS.chain}km)`);
          if (km >= THRESHOLDS.cables) warnings.push(`   ⚠️ Kabels check aanbevolen (>${THRESHOLDS.cables}km)`);
          result += warnings.length > 0 ? warnings.join("\n") + "\n" : "   ✅ Geen service nodig\n";
          result += "\n";
        }
      }

      if (shoes.length > 0) {
        result += "👟 SCHOENEN\n\n";
        for (const shoe of shoes) {
          const km = Math.round(shoe.distance / 1000);
          result += `${shoe.name}\n   📏 ${km.toLocaleString()} km\n`;
          result += km >= 800 ? `   ⚠️ Overweeg nieuwe schoenen (>${km}km)\n` : "   ✅ Goed\n";
          result += "\n";
        }
      }

      if (bikes.length === 0 && shoes.length === 0) result += "Geen gear gevonden in je Strava profiel.\n";

      result += "💡 TIPS\n";
      result += `   Ketting: elke ${THRESHOLDS.chain}km\n`;
      result += `   Cassette: elke ${THRESHOLDS.cassette}km\n`;
      result += `   Banden: elke ${THRESHOLDS.tires}km of bij slijtage\n`;
      result += `   Kabels: elke ${THRESHOLDS.cables}km\n`;
      return [{ type: "text", text: result }];
    }

    if (name === "get_power_curve") {
      const now = Date.now();
      const cutoffThis = now - 30 * 86400000;
      const cutoffPrev = now - 60 * 86400000;
      const DURATIONS: [number, string, string][] = [
        [5, "5s", "sprint power"], [60, "1min", "anaerobic capacity"],
        [300, "5min", "VO2max"], [1200, "20min", "FTP basis"], [3600, "60min", "threshold"],
      ];

      const bestThis: Record<number, number> = {};
      const bestPrev: Record<number, number> = {};
      for (const [d] of DURATIONS) { bestThis[d] = 0; bestPrev[d] = 0; }

      const activities = await getActivities(userId, 200);
      let powerFound = false;

      for (const a of activities) {
        const actTime = new Date(a.start_date_local).getTime();
        if (actTime < cutoffPrev) continue;
        try {
          const streams = await getActivityStreams(userId, a.id, ["watts"]);
          const wattsStream = streams?.find((s: any) => s.type === "watts");
          if (!wattsStream?.data?.length) continue;
          powerFound = true;
          const watts: number[] = wattsStream.data;
          for (const [dur] of DURATIONS) {
            const bp = findBestPower(watts, dur);
            if (actTime >= cutoffThis) bestThis[dur] = Math.max(bestThis[dur], bp);
            else bestPrev[dur] = Math.max(bestPrev[dur], bp);
          }
        } catch { continue; }
      }

      if (!powerFound) return [{ type: "text", text: "⚠️ Geen power data gevonden in recente activities.\nZorg ervoor dat je een power meter gebruikt." }];

      let result = "⚡ POWER CURVE ANALYSE\n\n📊 BEST POWER OUTPUTS\n";
      for (const [dur, label, desc] of DURATIONS) {
        result += `   ${label.padStart(5)}: ${String(bestThis[dur]).padStart(5)}W  (${desc})\n`;
      }

      const ftp = Math.round(bestThis[1200] * 0.95);
      result += `\n🎯 GESCHATTE FTP\n   FTP: ${ftp}W (95% van 20min power)\n`;

      const athlete = await getAthlete(userId);
      if (athlete.weight && athlete.weight > 0) {
        result += `   W/kg: ${(ftp / athlete.weight).toFixed(1)} (bij ${Math.round(athlete.weight)}kg)\n`;
      }

      const hasPrev = DURATIONS.some(([d]) => bestPrev[d] > 0);
      if (hasPrev) {
        result += "\n📈 VERGELIJKING VORIGE MAAND\n";
        for (const [dur, label] of DURATIONS) {
          if (bestPrev[dur] > 0 && bestThis[dur] > 0) {
            const diff = bestThis[dur] - bestPrev[dur];
            const pct = (diff / bestPrev[dur]) * 100;
            result += `   ${label.padStart(5)}: ${diff >= 0 ? "+" : ""}${diff}W (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%) ${diff >= 0 ? "🟢" : "🔴"}\n`;
          }
        }
      }
      return [{ type: "text", text: result }];
    }

    if (name === "get_hr_zone_distribution") {
      const cutoff = Date.now() - 28 * 86400000;
      const activities = await getActivities(userId, 100);
      const recent = activities.filter((a: any) => new Date(a.start_date_local).getTime() >= cutoff);

      if (recent.length === 0) return [{ type: "text", text: "⚠️ Geen activities gevonden in de laatste 4 weken." }];

      let maxHr = 0;
      for (const a of recent) { if (a.max_heartrate && a.max_heartrate > maxHr) maxHr = a.max_heartrate; }
      if (maxHr === 0) return [{ type: "text", text: "⚠️ Geen hartslag data gevonden. Gebruik je een HR monitor?" }];

      const zones: [number, number][] = [
        [0, maxHr * 0.70], [maxHr * 0.70, maxHr * 0.80], [maxHr * 0.80, maxHr * 0.87],
        [maxHr * 0.87, maxHr * 0.93], [maxHr * 0.93, 999],
      ];
      const zoneSecs = [0, 0, 0, 0, 0];
      let hrFound = false;

      for (const a of recent) {
        try {
          const streams = await getActivityStreams(userId, a.id, ["heartrate"]);
          const hrStream = streams?.find((s: any) => s.type === "heartrate");
          if (!hrStream?.data?.length) continue;
          hrFound = true;
          for (const hr of hrStream.data) {
            for (let z = 0; z < 5; z++) {
              if (hr >= zones[z][0] && hr < zones[z][1]) { zoneSecs[z]++; break; }
            }
          }
        } catch { continue; }
      }

      if (!hrFound) return [{ type: "text", text: "⚠️ Geen HR stream data beschikbaar voor recente activities." }];

      const total = zoneSecs.reduce((a, b) => a + b, 0);
      if (total === 0) return [{ type: "text", text: "⚠️ Geen HR data om te analyseren." }];

      const zoneNames = ["recovery", "endurance", "tempo", "threshold", "VO2max"];
      const makeBar = (pct: number) => "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      const fmtHM = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

      let result = `❤️ HR ZONE DISTRIBUTIE (laatste 4 weken)\n\n   Max HR gebruikt: ${Math.round(maxHr)} bpm\n\n⏱️ TIJD PER ZONE\n`;
      for (let z = 0; z < 5; z++) {
        const pct = (zoneSecs[z] / total) * 100;
        result += `   Zone ${z + 1} (${zoneNames[z].padStart(10)}): ${fmtHM(zoneSecs[z]).padStart(6)} uur (${Math.round(pct).toString().padStart(3)}%)  ${makeBar(pct)}\n`;
      }
      result += `\n   Totaal: ${fmtHM(total)} uur\n`;

      const z12 = ((zoneSecs[0] + zoneSecs[1]) / total) * 100;
      const z45 = ((zoneSecs[3] + zoneSecs[4]) / total) * 100;
      const z3 = (zoneSecs[2] / total) * 100;

      result += "\n💡 TRAINING BALANCE\n";
      if (z12 >= 60 && z12 <= 80) result += `   ✅ Goede Z2 basis (${Math.round(z12)}% — ideaal 60-80%)\n`;
      else if (z12 < 60) result += `   ⚠️ Te weinig Z1/Z2 (${Math.round(z12)}% — aanbevolen 60-80%)\n`;
      else result += `   ⚠️ Veel Z1/Z2 (${Math.round(z12)}% — misschien meer intensiteit nodig)\n`;

      if (z45 >= 10 && z45 <= 20) result += `   ✅ Goede intensiteit (${Math.round(z45)}% — ideaal 10-20%)\n`;
      else if (z45 < 10) result += `   ⚠️ Weinig Z4/Z5 intensiteit (${Math.round(z45)}% — aanbevolen 10-20%)\n`;
      else result += `   ⚠️ Veel intensiteit (${Math.round(z45)}% — risico op overtraining)\n`;

      if (z3 > 15) result += `   ⚠️ Veel Z3 grey zone (${Math.round(z3)}% — probeer te polariseren)\n`;

      result += "\n📋 ADVIES\n";
      if (z45 < 10) result += "   Verhoog intensiteit: voeg 1-2 interval sessies toe per week\n";
      else if (z12 < 60) result += "   Meer easy rides: bouw Z2 basis op voor duurzame progressie\n";
      else if (z3 > 15) result += "   Polariseer meer: rij makkelijker OF harder, vermijd de grey zone\n";
      else result += "   Goede verdeling! Blijf zo doorgaan.\n";

      return [{ type: "text", text: result }];
    }

    if (name === "get_hr_drift_analysis") {
      const activities = await getActivities(userId, 50);
      const longRides = activities.filter((a: any) => a.moving_time >= 3600).slice(0, 10);

      if (longRides.length === 0) return [{ type: "text", text: "⚠️ Geen ritten >60 minuten gevonden.\nHR drift analyse vereist langere rides." }];

      let result = "📉 HR DRIFT ANALYSE\n\n📊 RECENTE RITTEN\n\n";
      const driftValues: number[] = [];

      for (const a of longRides) {
        try {
          const streams = await getActivityStreams(userId, a.id, ["heartrate"]);
          const hrStream = streams?.find((s: any) => s.type === "heartrate");
          if (!hrStream?.data?.length || hrStream.data.length < 20) continue;

          const hrData: number[] = hrStream.data;
          const quarter = Math.floor(hrData.length / 4);
          const firstAvg = hrData.slice(0, quarter).reduce((a: number, b: number) => a + b, 0) / quarter;
          const lastAvg = hrData.slice(-quarter).reduce((a: number, b: number) => a + b, 0) / quarter;
          if (firstAvg === 0) continue;

          const drift = Math.round(((lastAvg / firstAvg) - 1) * 1000) / 10;
          const [icon, rating] = drift < 5 ? ["✅", "uitstekend"] : drift < 10 ? ["🟡", "redelijk"] : ["🔴", "hoog"];

          const date = new Date(a.start_date_local).toLocaleDateString("nl-NL", { day: "2-digit", month: "short" });
          const durH = (a.moving_time / 3600).toFixed(1);

          result += `   ${date} — ${durH}u ${a.name}\n`;
          result += `   Drift: ${drift.toFixed(1)}% ${icon} (${rating})\n`;
          result += `   Start HR: ${Math.round(firstAvg)} → Eind HR: ${Math.round(lastAvg)}\n\n`;
          driftValues.push(drift);
        } catch { continue; }
      }

      if (driftValues.length === 0) return [{ type: "text", text: "⚠️ Geen HR stream data beschikbaar voor langere ritten." }];

      const avgDrift = driftValues.reduce((a, b) => a + b, 0) / driftValues.length;
      result += "📈 TREND\n";
      result += `   Gemiddelde drift: ${avgDrift.toFixed(1)}%\n`;

      if (driftValues.length >= 4) {
        const half = Math.floor(driftValues.length / 2);
        const firstHalf = driftValues.slice(0, half).reduce((a, b) => a + b, 0) / half;
        const secondHalf = driftValues.slice(half).reduce((a, b) => a + b, 0) / (driftValues.length - half);
        const trend = secondHalf - firstHalf;
        result += `   Trend: ${trend >= 0 ? "+" : ""}${trend.toFixed(1)}% ${trend < 0 ? "🟢" : "🔴"} (${trend < 0 ? "verbeterend" : "verslechterend"})\n`;
      }

      result += "\n💡 INTERPRETATIE\n   <5%:  Uitstekende aerobe efficiency ✅\n   5-10%: Normaal 🟡\n   >10%: Vermoeidheid of dehydratie 🔴\n";
      result += "\n🎯 ADVIES\n";
      if (avgDrift < 5) result += "   Uitstekende aerobe basis! Blijf Z2 volume opbouwen.\n";
      else if (avgDrift < 10) result += "   Normale drift. Meer Z2 endurance kan dit verbeteren.\n";
      else result += "   Hoge drift. Focus op hydratatie en langere Z2 rides.\n";

      return [{ type: "text", text: result }];
    }

    if (name === "check_workout_quality") {
      const id = Number(args.activity_id);
      if (isNaN(id)) return [{ type: "text", text: "Ongeldig activity ID." }];

      const activity = await getActivity(userId, id);
      let watts: number[] = [];
      let hrData: number[] = [];

      try {
        const streams = await getActivityStreams(userId, id, ["watts", "heartrate"]);
        const wattsStream = streams?.find((s: any) => s.type === "watts");
        const hrStream = streams?.find((s: any) => s.type === "heartrate");
        if (wattsStream?.data) watts = wattsStream.data;
        if (hrStream?.data) hrData = hrStream.data;
      } catch { /* no streams */ }

      if (watts.length < 300) return [{ type: "text", text: "⚠️ Geen power data beschikbaar.\nWorkout quality check vereist een power meter." }];

      // Detect intervals: sustained >20% above average for >120s
      const overallAvg = watts.reduce((a, b) => a + b, 0) / watts.length;
      const threshold = overallAvg * 1.20;
      const intervals: { start: number; end: number; watts: number[] }[] = [];
      let inInterval = false, start = 0;

      for (let i = 0; i < watts.length; i++) {
        if (watts[i] >= threshold && !inInterval) { inInterval = true; start = i; }
        else if (watts[i] < threshold && inInterval) {
          inInterval = false;
          if (i - start >= 120) intervals.push({ start, end: i, watts: watts.slice(start, i) });
        }
      }
      if (inInterval && watts.length - start >= 120) intervals.push({ start, end: watts.length, watts: watts.slice(start) });

      if (intervals.length === 0) return [{ type: "text", text: `⚠️ Geen intervals gedetecteerd in '${activity.name}'.` }];

      let result = `✅ WORKOUT QUALITY CHECK\n   Activity: "${activity.name}"\n\n🔥 INTERVAL ANALYSE\n\n`;
      const allCvs: number[] = [];
      let firstAvg = 0;

      for (let i = 0; i < intervals.length; i++) {
        const intWatts = intervals[i].watts;
        const avg = Math.round(intWatts.reduce((a, b) => a + b, 0) / intWatts.length);
        const stdDev = Math.sqrt(intWatts.reduce((sum, w) => sum + (w - avg) ** 2, 0) / intWatts.length);
        const cv = avg > 0 ? Math.round((stdDev / avg) * 1000) / 10 : 0;
        if (i === 0) firstAvg = avg;
        const pctVsFirst = i > 0 && firstAvg > 0 ? ` (${((avg / firstAvg - 1) * 100).toFixed(1)}%)` : "";
        const [cvIcon, cvLabel] = cv < 5 ? ["✅", "zeer stabiel"] : cv < 10 ? ["🟡", "redelijk"] : ["🔴", "variabel"];
        const mins = Math.floor(intWatts.length / 60);
        const secs = intWatts.length % 60;

        result += `   Interval ${i + 1}: ${mins}:${String(secs).padStart(2, "0")} @ ${avg}W avg${pctVsFirst}\n`;
        result += `   Consistency: ${cv.toFixed(1)}% ${cvIcon} (${cvLabel})\n`;
        if (hrData.length > intervals[i].end) {
          const intHr = hrData.slice(intervals[i].start, intervals[i].end);
          if (intHr.length > 0) result += `   Avg HR: ${Math.round(intHr.reduce((a, b) => a + b, 0) / intHr.length)} bpm\n`;
        }
        result += "\n";
        allCvs.push(cv);
      }

      const lastAvg = Math.round(intervals[intervals.length - 1].watts.reduce((a, b) => a + b, 0) / intervals[intervals.length - 1].watts.length);
      const decoupling = firstAvg > 0 ? Math.round(((lastAvg / firstAvg) - 1) * 1000) / 10 : 0;
      const avgCv = allCvs.reduce((a, b) => a + b, 0) / allCvs.length;

      const decIcon = Math.abs(decoupling) < 5 ? "✅" : Math.abs(decoupling) < 10 ? "🟡" : "🔴";
      const cvIcon = avgCv < 5 ? "✅" : avgCv < 10 ? "🟡" : "🔴";

      result += "📊 OVERALL\n";
      result += `   Power decoupling: ${decoupling >= 0 ? "+" : ""}${decoupling.toFixed(1)}% ${decIcon}\n`;
      result += `   (laatste vs eerste interval)\n`;
      result += `   Consistency gemiddeld: ${avgCv.toFixed(1)}% ${cvIcon}\n`;

      let score = 10;
      if (avgCv > 5) score -= (avgCv - 5) * 0.3;
      if (Math.abs(decoupling) > 5) score -= (Math.abs(decoupling) - 5) * 0.2;
      score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));

      result += "\n💡 BEOORDELING\n";
      if (decoupling < -5) result += "   Vermoeidheid zichtbaar in latere intervals.\n   Volgende keer: iets lager starten of recovery verlengen.\n";
      else if (avgCv > 10) result += "   Variabele power output. Probeer stabieler te rijden.\n";
      else result += "   Goede uitvoering! Consistente intervals.\n";

      result += `\n   ⭐ Overall score: ${score}/10\n`;
      return [{ type: "text", text: result }];
    }

    return [{ type: "text", text: `Unknown tool: ${name}` }];
  } catch (e: any) {
    return [{ type: "text", text: `Error: ${e.message}` }];
  }
}
