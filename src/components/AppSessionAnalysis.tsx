import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Timer, TrendingUp, TrendingDown, Clock } from 'lucide-react';

const STORAGE_KEY = 'app-session-times';

interface SessionData {
  [date: string]: number;
}

function loadData(): SessionData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export const AppSessionAnalysis: React.FC = () => {
  const analysis = useMemo(() => {
    const data = loadData();
    const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      return { chartData: [], avgDaily: 0, totalAll: 0, totalThisWeek: 0, totalLastWeek: 0, trend: 0, totalDays: 0, yearlyData: [] };
    }

    // Last 14 days
    const now = new Date();
    const last14 = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (13 - i));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    const chartData = last14.map(date => {
      const secs = data[date] || 0;
      const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
      return { date, label: dayLabel, minutes: Math.round(secs / 60) };
    });

    const thisWeekDates = last14.slice(7);
    const lastWeekDates = last14.slice(0, 7);

    const totalThisWeek = thisWeekDates.reduce((sum, d) => sum + (data[d] || 0), 0);
    const totalLastWeek = lastWeekDates.reduce((sum, d) => sum + (data[d] || 0), 0);

    const daysWithData = entries.filter(([, v]) => v > 0).length;
    const totalAll = entries.reduce((sum, [, v]) => sum + v, 0);
    const avgDaily = daysWithData > 0 ? Math.round(totalAll / daysWithData) : 0;

    const trend = totalLastWeek > 0
      ? Math.round(((totalThisWeek - totalLastWeek) / totalLastWeek) * 100)
      : 0;

    // Yearly monthly breakdown
    const year = now.getFullYear();
    const yearlyData = Array.from({ length: 12 }, (_, m) => {
      const monthPrefix = `${year}-${String(m + 1).padStart(2, '0')}`;
      const monthEntries = entries.filter(([d]) => d.startsWith(monthPrefix));
      const totalSecs = monthEntries.reduce((sum, [, v]) => sum + v, 0);
      const monthLabel = new Date(year, m, 1).toLocaleDateString('en', { month: 'short' });
      return { month: monthLabel, minutes: Math.round(totalSecs / 60) };
    });

    return { chartData, avgDaily, totalAll, totalThisWeek, totalLastWeek, trend, totalDays: daysWithData, yearlyData };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="h-4 w-4" />
          Logging Time Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">All Time</p>
            <p className="text-sm font-bold text-foreground">{formatDuration(analysis.totalAll)}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Avg Daily</p>
            <p className="text-sm font-bold text-foreground">{formatDuration(analysis.avgDaily)}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">This Week</p>
            <p className="text-sm font-bold text-foreground">{formatDuration(analysis.totalThisWeek)}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">vs Last Week</p>
            <div className="flex items-center justify-center gap-1">
              {analysis.trend > 0 ? (
                <TrendingUp className="h-3 w-3 text-chart-2" />
              ) : analysis.trend < 0 ? (
                <TrendingDown className="h-3 w-3 text-chart-4" />
              ) : (
                <Clock className="h-3 w-3 text-muted-foreground" />
              )}
              <p className="text-sm font-bold text-foreground">
                {analysis.trend > 0 ? '+' : ''}{analysis.trend}%
              </p>
            </div>
          </div>
        </div>

        {/* Chart */}
        {analysis.chartData.length > 0 && (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                  className="fill-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                  label={{ value: 'min', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value: number) => [`${value} min`, 'Time in app']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {analysis.totalDays} days tracked · Last 14 days shown
        </p>

        {/* Yearly logging time chart */}
        {analysis.yearlyData.some(d => d.minutes > 0) && (
          <>
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium text-foreground mb-2">Monthly Logging Time — {new Date().getFullYear()}</p>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" label={{ value: 'min', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => [`${value} min`, 'Time in app']} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="minutes" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
