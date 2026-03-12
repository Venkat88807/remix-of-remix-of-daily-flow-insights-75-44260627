import React, { useMemo } from 'react';
import { Moon, TrendingUp, TrendingDown, Minus, Clock, BedDouble, Sunrise } from 'lucide-react';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DayData } from '@/types/activity';

interface SleepAnalysisProps {
  allData: DayData[];
  periodDays?: number;
}

interface SleepEntry {
  date: string;
  bedtime: Date;
  wakeTime: Date;
  durationHours: number;
}

function extractSleepEntries(allData: DayData[]): SleepEntry[] {
  const entries: SleepEntry[] = [];

  allData.forEach(day => {
    day.activities
      .filter(a => a.category === 'sleep' && a.startTime && a.endTime)
      .forEach(a => {
        const bed = new Date(a.startTime);
        const wake = new Date(a.endTime!);
        const durMs = wake.getTime() - bed.getTime();
        if (durMs <= 0 || durMs > 24 * 60 * 60 * 1000) return;

        // Assign to the wake-up date
        const wakeDate = format(wake, 'yyyy-MM-dd');
        entries.push({
          date: wakeDate,
          bedtime: bed,
          wakeTime: wake,
          durationHours: durMs / (1000 * 60 * 60),
        });
      });
  });

  // Deduplicate by date (keep longest sleep per day)
  const byDate = new Map<string, SleepEntry>();
  entries.forEach(e => {
    const existing = byDate.get(e.date);
    if (!existing || e.durationHours > existing.durationHours) {
      byDate.set(e.date, e);
    }
  });

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function fmtHM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime24(date: Date): string {
  return format(date, 'HH:mm');
}

function avgTimeOfDay(dates: Date[]): string {
  if (dates.length === 0) return '--:--';
  // Convert to minutes since midnight, handling cross-midnight for bedtimes
  let totalMin = 0;
  dates.forEach(d => {
    let mins = d.getHours() * 60 + d.getMinutes();
    // If bedtime is before 12pm, it's likely the next day conceptually
    // For bedtimes: hours < 12 means after midnight, add 24h
    if (mins < 720) mins += 1440; // treat 0:00-11:59 as 24:00-35:59
    totalMin += mins;
  });
  const avg = Math.round(totalMin / dates.length) % 1440;
  const h = Math.floor(avg / 60);
  const m = avg % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const SleepAnalysis: React.FC<SleepAnalysisProps> = ({ allData, periodDays = 28 }) => {
  const stats = useMemo(() => {
    const allEntries = extractSleepEntries(allData);
    const cutoff = subDays(new Date(), periodDays);
    const entries = allEntries.filter(e => new Date(e.date) >= cutoff);

    if (entries.length === 0) {
      return null;
    }

    const totalHours = entries.reduce((s, e) => s + e.durationHours, 0);
    const avgDuration = totalHours / entries.length;
    const avgBedtime = avgTimeOfDay(entries.map(e => e.bedtime));
    const avgWakeTime = avgTimeOfDay(entries.map(e => e.wakeTime));

    // Trend: compare last 7 vs previous 7
    const now = new Date();
    const last7 = entries.filter(e => new Date(e.date) >= subDays(now, 7));
    const prev7 = entries.filter(e => {
      const d = new Date(e.date);
      return d >= subDays(now, 14) && d < subDays(now, 7);
    });
    const avgLast7 = last7.length > 0 ? last7.reduce((s, e) => s + e.durationHours, 0) / last7.length : 0;
    const avgPrev7 = prev7.length > 0 ? prev7.reduce((s, e) => s + e.durationHours, 0) / prev7.length : 0;
    const trendDiff = avgLast7 - avgPrev7;

    // Consistency: std deviation of duration
    const mean = avgDuration;
    const variance = entries.reduce((s, e) => s + Math.pow(e.durationHours - mean, 2), 0) / entries.length;
    const stdDev = Math.sqrt(variance);

    // Chart data: last 14 days
    const chartDays = eachDayOfInterval({ start: subDays(now, 13), end: now });
    const chartData = chartDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = entries.find(e => e.date === dateStr);
      return {
        label: format(day, 'M/d'),
        hours: entry ? Math.round(entry.durationHours * 10) / 10 : 0,
        bedtime: entry ? fmtTime24(entry.bedtime) : null,
        wakeTime: entry ? fmtTime24(entry.wakeTime) : null,
      };
    });

    // Best/worst night
    const sorted = [...entries].sort((a, b) => b.durationHours - a.durationHours);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Nights with < 7h
    const shortNights = entries.filter(e => e.durationHours < 7).length;

    return {
      entries,
      avgDuration,
      avgBedtime,
      avgWakeTime,
      trendDiff,
      stdDev,
      chartData,
      best,
      worst,
      shortNights,
      totalNights: entries.length,
    };
  }, [allData, periodDays]);

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Moon className="h-4 w-4 text-primary" /> Sleep Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Moon className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No sleep data yet. Use "Log Sleep" to track your sleep.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const TrendIcon = stats.trendDiff > 0.25 ? TrendingUp : stats.trendDiff < -0.25 ? TrendingDown : Minus;
  const trendColor = stats.trendDiff > 0.25 ? 'text-green-500' : stats.trendDiff < -0.25 ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4 text-center">
            <Clock className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-xs text-muted-foreground">Avg Duration</p>
            <p className="text-xl font-bold text-foreground">{fmtHM(stats.avgDuration)}</p>
            <div className={`flex items-center justify-center gap-1 text-xs ${trendColor}`}>
              <TrendIcon className="h-3 w-3" />
              <span>{stats.trendDiff > 0 ? '+' : ''}{fmtHM(Math.abs(stats.trendDiff))} vs prev week</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <Moon className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-xs text-muted-foreground">Consistency</p>
            <p className="text-xl font-bold text-foreground">±{fmtHM(stats.stdDev)}</p>
            <p className="text-xs text-muted-foreground">{stats.stdDev < 0.5 ? 'Very consistent' : stats.stdDev < 1 ? 'Fairly consistent' : 'Irregular'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4 text-center">
            <BedDouble className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-xs text-muted-foreground">Avg Bedtime</p>
            <p className="text-xl font-bold text-foreground">{stats.avgBedtime}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <Sunrise className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-xs text-muted-foreground">Avg Wake Time</p>
            <p className="text-xl font-bold text-foreground">{stats.avgWakeTime}</p>
          </CardContent>
        </Card>
      </div>

      {/* Short nights warning */}
      {stats.shortNights > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 px-4">
            <p className="text-sm text-destructive font-medium">
              ⚠️ {stats.shortNights} of {stats.totalNights} nights were under 7 hours
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sleep Duration Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Moon className="h-4 w-4 text-primary" /> Sleep Duration (Last 14 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" domain={[0, 12]} tickFormatter={(v) => `${v}h`} />
                <ReferenceLine y={8} stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeOpacity={0.5} />
                <ReferenceLine y={7} stroke="hsl(var(--destructive))" strokeDasharray="4 4" strokeOpacity={0.3} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.[0]) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-card border rounded-lg p-2 text-xs shadow-md">
                        <p className="font-medium">{label}</p>
                        {data.hours > 0 ? (
                          <>
                            <p>Duration: <span className="font-bold">{fmtHM(data.hours)}</span></p>
                            {data.bedtime && <p>Bed: {data.bedtime}</p>}
                            {data.wakeTime && <p>Wake: {data.wakeTime}</p>}
                          </>
                        ) : (
                          <p className="text-muted-foreground">No data</p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="hours" fill="hsl(220 70% 50%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground justify-center">
            <span className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-primary opacity-50" /> 8h target
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-destructive opacity-30" /> 7h minimum
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Best / Worst */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Best Night</p>
            <p className="text-lg font-bold text-foreground">{fmtHM(stats.best.durationHours)}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(stats.best.date), 'MMM d')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Worst Night</p>
            <p className="text-lg font-bold text-foreground">{fmtHM(stats.worst.durationHours)}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(stats.worst.date), 'MMM d')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
