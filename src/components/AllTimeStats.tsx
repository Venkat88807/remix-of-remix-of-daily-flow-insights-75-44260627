import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Clock, TrendingUp, Activity as ActivityIcon, Shield, Smartphone, Flame } from 'lucide-react';
import { DayData, CATEGORY_COLORS, CATEGORY_LABELS, ActivityCategory } from '@/types/activity';
import { DistractionEvent } from '@/hooks/useAppUsageMonitor';
import { SnapshotSession } from './ScreentimeSnapshot';
import { supabase } from '@/integrations/supabase/client';

interface AllTimeStatsProps {
  allData: DayData[];
  distractionHistory: DistractionEvent[];
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '0m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs < 24) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

interface AppUsageStat {
  appName: string;
  totalSeconds: number;
}

export const AllTimeStats: React.FC<AllTimeStatsProps> = ({ allData, distractionHistory }) => {
  const [appUsageStats, setAppUsageStats] = useState<AppUsageStat[]>([]);

  // Load all-time app usage from backend
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('app_usage_logs')
        .select('app_name, duration_seconds');

      if (data) {
        const totals = new Map<string, number>();
        data.forEach(d => {
          totals.set(d.app_name, (totals.get(d.app_name) || 0) + d.duration_seconds);
        });
        setAppUsageStats(
          Array.from(totals.entries())
            .map(([appName, totalSeconds]) => ({ appName, totalSeconds }))
            .sort((a, b) => b.totalSeconds - a.totalSeconds)
        );
      }
    };
    load();
  }, []);

  // Load all snapshot sessions for all-time integrity
  const allSnapshotSessions: SnapshotSession[] = useMemo(() => {
    try {
      const stored = localStorage.getItem('screentime-sessions');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }, []);

  const stats = useMemo(() => {
    const productiveCategories = ['work', 'coding', 'meetings'];

    // All data (not filtered to year)
    const daysTracked = allData.filter(d => d.activities.length > 0).length;
    const totalActivities = allData.reduce((sum, d) => sum + d.activities.length, 0);

    let totalProductiveMin = 0;
    let totalTrackedMin = 0;
    const categoryMinutes: Record<string, number> = {};

    // First tracked date
    const sortedDates = allData.filter(d => d.activities.length > 0).map(d => d.date).sort();
    const firstDate = sortedDates[0] || null;

    allData.forEach(d => {
      d.activities.forEach(a => {
        const dur = Math.max(0, a.duration || 0);
        if (dur <= 0) return;
        totalTrackedMin += dur;
        const cat = a.category;
        categoryMinutes[cat] = (categoryMinutes[cat] || 0) + dur;
        if (productiveCategories.includes(cat)) {
          totalProductiveMin += dur;
        }
      });
    });

    // All-time distraction
    const totalDistractionMin = distractionHistory
      .filter(d => d.userResponded && !d.isWorkRelated && d.durationSeconds)
      .reduce((sum, d) => sum + (d.durationSeconds || 0), 0) / 60;

    // Snapshot-based distraction (all time)
    const snapshotDistractionMin = allSnapshotSessions
      .reduce((sum, s) => sum + Math.round(s.totalDistractionSeconds / 60), 0);

    const totalAllDistraction = totalDistractionMin + snapshotDistractionMin;

    // All-time integrity
    const actualWork = Math.max(0, totalProductiveMin - totalAllDistraction);
    const integrityPct = totalProductiveMin > 0
      ? Math.round((actualWork / totalProductiveMin) * 100)
      : 100;

    // Avg productive per day
    const avgProductivePerDay = daysTracked > 0 ? totalProductiveMin / daysTracked : 0;

    // Total app screen time
    const totalAppSeconds = appUsageStats.reduce((s, a) => s + a.totalSeconds, 0);

    // Current streak
    const now = new Date();
    let streak = 0;
    const allDates = new Set(sortedDates);
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (allDates.has(ds)) streak++;
      else break;
    }

    // Category pie
    const categoryData = Object.entries(categoryMinutes)
      .map(([cat, mins]) => ({
        name: CATEGORY_LABELS[cat as ActivityCategory] || cat,
        value: Math.round(mins),
        color: CATEGORY_COLORS[cat as ActivityCategory] || 'hsl(0 0% 60%)',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Monthly trend (all months ever)
    const monthlyMap = new Map<string, { productive: number; total: number }>();
    allData.forEach(d => {
      const monthKey = d.date.substring(0, 7);
      const existing = monthlyMap.get(monthKey) || { productive: 0, total: 0 };
      d.activities.forEach(a => {
        const dur = Math.max(0, a.duration || 0);
        existing.total += dur;
        if (productiveCategories.includes(a.category)) {
          existing.productive += dur;
        }
      });
      monthlyMap.set(monthKey, existing);
    });

    const monthlyData = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12) // Last 12 months
      .map(([key, val]) => {
        const [y, m] = key.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'short', year: '2-digit' });
        return {
          month: label,
          productive: Math.round(val.productive / 60),
          total: Math.round(val.total / 60),
        };
      });

    return {
      daysTracked,
      totalActivities,
      totalProductiveMin,
      totalTrackedMin,
      totalDistractionMin: totalAllDistraction,
      avgProductivePerDay,
      streak,
      categoryData,
      monthlyData,
      integrityPct,
      actualWork,
      totalAppSeconds,
      firstDate,
    };
  }, [allData, distractionHistory, allSnapshotSessions, appUsageStats]);

  const APP_COLORS = [
    'hsl(260 60% 55%)', 'hsl(180 60% 45%)', 'hsl(30 80% 55%)',
    'hsl(340 70% 55%)', 'hsl(200 70% 50%)', 'hsl(100 50% 45%)',
  ];

  return (
    <div className="space-y-4">
      {/* Key stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <CalendarDays className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground">{stats.daysTracked}</p>
            <p className="text-xs text-muted-foreground">Days tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Flame className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground">{stats.streak}</p>
            <p className="text-xs text-muted-foreground">Day streak 🔥</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground">{formatDuration(stats.totalProductiveMin)}</p>
            <p className="text-xs text-muted-foreground">Total work</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Shield className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground">{stats.integrityPct}%</p>
            <p className="text-xs text-muted-foreground">All-time integrity</p>
          </CardContent>
        </Card>
      </div>

      {/* More stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Total Tracked</p>
          <p className="text-sm font-bold text-foreground">{formatDuration(stats.totalTrackedMin)}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Avg/Day</p>
          <p className="text-sm font-bold text-foreground">{formatDuration(stats.avgProductivePerDay)}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Distractions</p>
          <p className="text-sm font-bold text-foreground">{formatDuration(stats.totalDistractionMin)}</p>
        </div>
      </div>

      {stats.firstDate && (
        <p className="text-xs text-muted-foreground text-center">
          Tracking since {new Date(stats.firstDate + 'T00:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}
          {' · '}{stats.totalActivities} activities logged
        </p>
      )}

      {/* All-time app usage */}
      {appUsageStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" /> All-Time Screen Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Total: {formatDuration(stats.totalAppSeconds / 60)}
            </p>
            <div className="space-y-2">
              {appUsageStats.slice(0, 10).map((app, i) => {
                const maxSecs = appUsageStats[0]?.totalSeconds || 1;
                return (
                  <div key={app.appName} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold text-primary-foreground flex-shrink-0"
                      style={{ backgroundColor: APP_COLORS[i % APP_COLORS.length] }}
                    >
                      {app.appName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium flex-1 truncate">{app.appName}</span>
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(app.totalSeconds / maxSecs) * 100}%`,
                          backgroundColor: APP_COLORS[i % APP_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums w-14 text-right">
                      {formatDuration(app.totalSeconds / 60)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly trend chart */}
      {stats.monthlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" label={{ value: 'hrs', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => [`${value}h`, '']} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="productive" name="Work" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="total" name="Total" fill="hsl(var(--primary) / 0.3)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category breakdown */}
      {stats.categoryData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">All-Time Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="h-48 w-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                      {stats.categoryData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatDuration(value), '']} contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.categoryData.map(cat => (
                  <div key={cat.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-muted-foreground">{cat.name}: {formatDuration(cat.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
