import React, { useMemo, useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, subMonths, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DayData } from '@/types/activity';
import { DistractionEvent } from '@/hooks/useAppUsageMonitor';
import { SnapshotSession } from './ScreentimeSnapshot';
import { TrendingUp, TrendingDown, Minus, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AppCategory {
  app_name: string;
  is_work_app: boolean | null;
}

interface MonthlyAnalysisProps {
  allData: DayData[];
  distractionHistory: DistractionEvent[];
  monthOffset?: number;
  snapshotSessions?: SnapshotSession[];
}

export const MonthlyAnalysis: React.FC<MonthlyAnalysisProps> = ({
  allData,
  distractionHistory,
  monthOffset = 0,
  snapshotSessions = [],
}) => {
  const [appCategories, setAppCategories] = useState<AppCategory[]>([]);
  const [appUsageLogs, setAppUsageLogs] = useState<{ app_name: string; duration_seconds: number; usage_date: string }[]>([]);

  const now = new Date();
  const targetMonth = subMonths(now, monthOffset);
  const monthStart = startOfMonth(targetMonth);
  const monthEnd = endOfMonth(targetMonth);

  useEffect(() => {
    const load = async () => {
      const { data: cats } = await supabase.from('app_categories').select('app_name, is_work_app');
      if (cats) setAppCategories(cats);

      const { data: logs } = await supabase
        .from('app_usage_logs')
        .select('app_name, duration_seconds, usage_date')
        .gte('usage_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('usage_date', format(monthEnd, 'yyyy-MM-dd'));
      if (logs) setAppUsageLogs(logs);
    };
    load();
  }, [monthOffset]);

  const isAppProductive = (appName: string): boolean | null => {
    // Check local session overrides first
    try {
      const local = localStorage.getItem('session-app-classifications');
      if (local) {
        const parsed = JSON.parse(local);
        // Find any classification for this app
        for (const sessionId of Object.keys(parsed)) {
          const cls = parsed[sessionId];
          if (cls[appName] !== undefined) {
            return cls[appName] === 'productive';
          }
        }
      }
    } catch {}
    // Fall back to DB classification
    const cat = appCategories.find(c => c.app_name.toLowerCase() === appName.toLowerCase());
    if (cat) return cat.is_work_app === true;
    return null; // unknown
  };

  const { monthData, weeklyBreakdown, totalWork, totalDistraction, prevMonthWork, prevMonthDistraction, integrityPercentage, totalScreenTimeMin, productiveAppMin, distractiveAppMin } = useMemo(() => {
    const prevMonth = subMonths(now, monthOffset + 1);
    const prevMonthStart = startOfMonth(prevMonth);
    const prevMonthEnd = endOfMonth(prevMonth);

    const productiveCategories = ['work', 'coding', 'meetings'];

    const getMonthStats = (start: Date, end: Date, includeApps: boolean) => {
      const days = eachDayOfInterval({ start, end });
      let work = 0;
      let distraction = 0;

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayData = allData.find(d => d.date === dateStr);
        if (dayData) {
          dayData.activities.forEach(a => {
            const dur = Math.max(0, a.duration || 0);
            if (dur > 0 && productiveCategories.includes(a.category)) {
              work += dur;
            }
          });
        }
        distractionHistory.forEach(d => {
          if (d.startedAt) {
            const dDate = format(new Date(d.startedAt), 'yyyy-MM-dd');
            if (dDate === dateStr && !d.isWorkRelated && d.userResponded && d.durationSeconds) {
              distraction += Math.round(d.durationSeconds / 60);
            }
          }
        });
      });

      // Add app usage from logs
      if (includeApps) {
        const daysSet = new Set(eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd')));
        appUsageLogs.forEach(log => {
          if (daysSet.has(log.usage_date)) {
            const mins = Math.round(log.duration_seconds / 60);
            const productive = isAppProductive(log.app_name);
            if (productive === true) work += mins;
            else if (productive === false) distraction += mins;
          }
        });

        // Add snapshot session distractions
        snapshotSessions.forEach(s => {
          const endDate = format(new Date(s.endTime), 'yyyy-MM-dd');
          if (daysSet.has(endDate)) {
            const distrMins = Math.round(s.totalDistractionSeconds / 60);
            distraction += distrMins;
          }
        });
      }

      return { work, distraction };
    };

    const current = getMonthStats(monthStart, monthEnd, true);
    const prev = getMonthStats(prevMonthStart, prevMonthEnd, false);

    // App usage stats for the month
    let prodAppMin = 0;
    let distAppMin = 0;
    let totalScreenMin = 0;
    appUsageLogs.forEach(log => {
      const mins = Math.round(log.duration_seconds / 60);
      totalScreenMin += mins;
      const productive = isAppProductive(log.app_name);
      if (productive === true) prodAppMin += mins;
      else if (productive === false) distAppMin += mins;
    });

    // Weekly breakdown
    const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });
    const weekly = weeks.map((weekStart, i) => {
      const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const effectiveEnd = wEnd > monthEnd ? monthEnd : wEnd;
      const effectiveStart = weekStart < monthStart ? monthStart : weekStart;
      const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
      const daysSet = new Set(days.map(d => format(d, 'yyyy-MM-dd')));

      let workMins = 0;
      let distractionMins = 0;

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayData = allData.find(d => d.date === dateStr);
        if (dayData) {
          dayData.activities.forEach(a => {
            const dur = Math.max(0, a.duration || 0);
            if (dur > 0 && productiveCategories.includes(a.category)) {
              workMins += dur;
            }
          });
        }
        distractionHistory.forEach(d => {
          if (d.startedAt) {
            const dDate = format(new Date(d.startedAt), 'yyyy-MM-dd');
            if (dDate === dateStr && !d.isWorkRelated && d.userResponded && d.durationSeconds) {
              distractionMins += Math.round(d.durationSeconds / 60);
            }
          }
        });
      });

      // Add app usage to weekly
      appUsageLogs.forEach(log => {
        if (daysSet.has(log.usage_date)) {
          const mins = Math.round(log.duration_seconds / 60);
          const productive = isAppProductive(log.app_name);
          if (productive === true) workMins += mins;
          else if (productive === false) distractionMins += mins;
        }
      });

      return {
        week: `W${i + 1}`,
        label: `${format(effectiveStart, 'MMM d')}–${format(effectiveEnd, 'd')}`,
        work: Math.round(workMins / 60 * 10) / 10,
        distraction: Math.round(distractionMins / 60 * 10) / 10,
      };
    });

    const totalAccountedFor = current.work + current.distraction;
    const integrity = totalAccountedFor > 0
      ? Math.round((current.work / totalAccountedFor) * 100)
      : 100;

    return {
      monthData: { start: monthStart, end: monthEnd },
      weeklyBreakdown: weekly,
      totalWork: current.work,
      totalDistraction: current.distraction,
      prevMonthWork: prev.work,
      prevMonthDistraction: prev.distraction,
      integrityPercentage: integrity,
      totalScreenTimeMin: totalScreenMin,
      productiveAppMin: prodAppMin,
      distractiveAppMin: distAppMin,
    };
  }, [allData, distractionHistory, monthOffset, appCategories, appUsageLogs, snapshotSessions]);

  const formatHours = (mins: number) => {
    const m = Math.max(0, Math.round(mins));
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
  };

  const workTrend = totalWork - prevMonthWork;
  const distractionTrend = totalDistraction - prevMonthDistraction;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {format(monthData.start, 'MMMM yyyy')}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Work</p>
            <p className="text-xl font-bold">{formatHours(totalWork)}</p>
            <div className="flex items-center gap-1 mt-1">
              {workTrend > 0 ? <TrendingUp className="h-3 w-3 text-chart-2" /> : workTrend < 0 ? <TrendingDown className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3" />}
              <span className="text-xs text-muted-foreground">{workTrend >= 0 ? '+' : ''}{formatHours(Math.abs(workTrend))}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Distraction</p>
            <p className="text-xl font-bold">{formatHours(totalDistraction)}</p>
            <div className="flex items-center gap-1 mt-1">
              {distractionTrend < 0 ? <TrendingDown className="h-3 w-3 text-chart-2" /> : distractionTrend > 0 ? <TrendingUp className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3" />}
              <span className="text-xs text-muted-foreground">{distractionTrend >= 0 ? '+' : ''}{formatHours(Math.abs(distractionTrend))}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Integrity</p>
            <p className="text-xl font-bold">{integrityPercentage}%</p>
            <p className="text-xs text-muted-foreground mt-1">actual work</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <Smartphone className="h-3 w-3 text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Screen Time</p>
            <p className="text-xl font-bold">{formatHours(totalScreenTimeMin)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {productiveAppMin > 0 && <span className="text-chart-2">{formatHours(productiveAppMin)} prod</span>}
              {productiveAppMin > 0 && distractiveAppMin > 0 && ' · '}
              {distractiveAppMin > 0 && <span className="text-destructive">{formatHours(distractiveAppMin)} dist</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Week-over-Week Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Week-over-Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyBreakdown}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v}h`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                  formatter={(value: number) => [`${value}h`, '']}
                />
                <Legend />
                <Bar dataKey="work" name="Work" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="distraction" name="Distraction" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
