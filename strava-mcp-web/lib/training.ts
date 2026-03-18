// strava-mcp-web/lib/training.ts

interface Activity {
  start_date_local: string;
  suffer_score: number | null;
}

interface DailyLoads {
  [date: string]: number; // ISO date string -> load
}

interface TrainingLoads {
  atl: number;
  ctl: number;
  tsb: number;
  dailyLoads: DailyLoads;
}

export function calculateTrainingLoads(
  activities: Activity[],
  daysAtl = 7,
  daysCtl = 42
): TrainingLoads {
  const now = new Date();
  const dailyLoads: DailyLoads = {};

  for (const activity of activities) {
    const actDate = new Date(activity.start_date_local);
    const dateStr = actDate.toISOString().split("T")[0];
    const daysAgo = Math.floor(
      (now.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysAgo > daysCtl) continue;

    const score = activity.suffer_score || 0;
    dailyLoads[dateStr] = (dailyLoads[dateStr] || 0) + score;
  }

  let atlSum = 0;
  for (let i = 0; i < daysAtl; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    if (key in dailyLoads) atlSum += dailyLoads[key];
  }

  let ctlSum = 0;
  for (let i = 0; i < daysCtl; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    if (key in dailyLoads) ctlSum += dailyLoads[key];
  }

  const atl = daysAtl > 0 ? atlSum / daysAtl : 0;
  const ctl = daysCtl > 0 ? ctlSum / daysCtl : 0;

  return {
    atl: Math.round(atl * 10) / 10,
    ctl: Math.round(ctl * 10) / 10,
    tsb: Math.round((ctl - atl) * 10) / 10,
    dailyLoads,
  };
}

export function getTrainingRecommendation(tsb: number, atl: number, ctl: number) {
  let status: string, advice: string, intensity: string;

  if (tsb < -30) {
    status = "REST";
    advice = "You are very fatigued. Take at least 1-2 rest days.";
    intensity = "Rest or very light recovery ride (<60% FTP)";
  } else if (tsb < -10) {
    status = "EASY";
    advice = "Slightly fatigued. Train light or take a rest day.";
    intensity = "Zone 1-2 recovery rides, max 60-90 min";
  } else if (tsb < 5) {
    status = "MODERATE";
    advice = "Good balance! Train normally with moderate intensity.";
    intensity = "Zone 2-3 endurance, tempo intervals possible";
  } else if (tsb < 25) {
    status = "HARD";
    advice = "Fresh and well-recovered! Perfect for intense training.";
    intensity = "VO2max intervals, threshold work, race efforts";
  } else {
    status = "DETRAINING RISK";
    advice = "Haven't trained intensely in a while. Build up gradually.";
    intensity = "Build volume and intensity slowly";
  }

  let fitnessContext: string;
  if (ctl < 30) fitnessContext = "Base fitness is low. Focus on building volume.";
  else if (ctl < 60) fitnessContext = "Solid base fitness.";
  else fitnessContext = "High fitness level! Keep it up.";

  return { status, advice, intensity, fitnessContext };
}

export function calculateWeeklyTrends(dailyLoads: DailyLoads, weeks = 8) {
  const now = new Date();
  const trends = [];

  for (let w = 0; w < weeks; w++) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - w * 7);

    let atlSum = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekEnd);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (key in dailyLoads) atlSum += dailyLoads[key];
    }

    let ctlSum = 0;
    for (let i = 0; i < 42; i++) {
      const d = new Date(weekEnd);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (key in dailyLoads) ctlSum += dailyLoads[key];
    }

    const atl = atlSum / 7;
    const ctl = ctlSum / 42;

    trends.push({
      weekLabel: w === 0 ? "This week" : `Week -${w}`,
      atl: Math.round(atl * 10) / 10,
      ctl: Math.round(ctl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }

  return trends.reverse();
}

export function calculateRampRate(weeklyTrends: ReturnType<typeof calculateWeeklyTrends>) {
  if (weeklyTrends.length < 2) return null;

  const current = weeklyTrends[weeklyTrends.length - 1];
  const previous = weeklyTrends[weeklyTrends.length - 2];

  if (previous.atl === 0) return null;

  const rate = ((current.atl - previous.atl) / previous.atl) * 100;

  let status: string, warning: string;
  if (rate > 15) {
    status = "TOO FAST";
    warning = "WARNING: Load increased >15% — high injury risk!";
  } else if (rate > 10) {
    status = "FAST";
    warning = "Caution: Load increased >10% — monitor fatigue closely";
  } else if (rate > 5) {
    status = "GOOD";
    warning = "Healthy progression — load increasing steadily";
  } else if (rate > -5) {
    status = "STABLE";
    warning = "Load is stable — good maintenance";
  } else {
    status = "DECLINING";
    warning = "Load is declining — recovery period or detraining?";
  }

  return {
    rate: Math.round(rate * 10) / 10,
    status,
    warning,
    currentAtl: current.atl,
    previousAtl: previous.atl,
  };
}

export function generateWeeklyRecommendation(
  tsb: number,
  atl: number,
  ctl: number,
  rampRate: ReturnType<typeof calculateRampRate>
) {
  const currentWeeklyHours = (atl * 7) / 60;
  let targetHours: number, volumeAdvice: string;

  if (rampRate && rampRate.rate > 10) {
    targetHours = currentWeeklyHours * 0.9;
    volumeAdvice = "Reduce volume by 10% (ramp rate too high)";
  } else if (tsb < -30) {
    targetHours = currentWeeklyHours * 0.7;
    volumeAdvice = "Reduce volume by 30% (recovery needed)";
  } else if (tsb < -10) {
    targetHours = currentWeeklyHours * 0.85;
    volumeAdvice = "Reduce volume by 15% (recovery week)";
  } else if (tsb > 15) {
    targetHours = currentWeeklyHours * 1.08;
    volumeAdvice = "Increase volume by 8% (good form for building)";
  } else if (tsb > 5) {
    targetHours = currentWeeklyHours * 1.05;
    volumeAdvice = "Increase volume by 5% (safe progression)";
  } else {
    targetHours = currentWeeklyHours;
    volumeAdvice = "Maintain current volume (good balance)";
  }

  let plan: Record<string, number>, intensityNote: string;

  if (tsb < -30) {
    plan = { endurance: 2, recovery: 2, intervals: 0, rest: 3 };
    intensityNote = "Focus on recovery — light rides only";
  } else if (tsb < -10) {
    plan = { endurance: 2, recovery: 2, intervals: 0, rest: 3 };
    intensityNote = "Recovery week — no intense workouts";
  } else if (tsb < 5) {
    plan = { endurance: 3, tempo: 1, recovery: 1, rest: 2 };
    intensityNote = "Balanced week — endurance + 1x tempo";
  } else if (tsb < 15) {
    plan = { endurance: 2, tempo: 1, intervals: 1, recovery: 1, rest: 2 };
    intensityNote = "Build week — endurance + intensity possible";
  } else {
    plan = { endurance: 2, intervals: 2, recovery: 1, rest: 2 };
    intensityNote = "High intensity week — you're fresh enough!";
  }

  return {
    targetHours: Math.round(targetHours * 10) / 10,
    currentHours: Math.round(currentWeeklyHours * 10) / 10,
    volumeAdvice,
    plan,
    intensityNote,
  };
}
