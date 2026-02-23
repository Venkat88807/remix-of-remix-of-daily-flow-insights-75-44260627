import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Clock, TrendingUp, Activity as ActivityIcon } from 'lucide-react';
import { DayData, CATEGORY_COLORS, CATEGORY_LABELS, ActivityCategory } from '@/types/activity';
import { DistractionEvent } from '@/hooks/useAppUsageMonitor';

interface YearlyStatsProps {
  allData: DayData[];
  distractionHistory: DistractionEvent[];
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs < 24) return `${hrs}h ${mins}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

export const YearlyStats: React.FC<YearlyStatsProps> = ({ allData, distractionHistory }) => {
  const stats = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearStartStr = `${now.getFullYear()}-01-01`;

    // Filter to current year
    const yearData = allData.filter(d => d.date >= yearStartStr);

    // Total days tracked
    const daysTracked = yearData.filter(d => d.activities.length > 0).length;

    // Total activities
    const totalActivities = yearData.reduce((sum, d) => sum + d.activities.length, 0);

    // Total productive minutes (work + coding + meetings)
    const productiveCategories = ['work', 'coding', 'meetings'];
    let totalProductiveMin = 0;
    let totalTrackedMin = 0;

    // Category breakdown
    const categoryMinutes: Record<string, number> = {};

    // Monthly breakdown for chart
    const monthlyData: { month: string; productive: number; total: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const monthStr = `${now.getFullYear()}-${String(m + 1).padStart(2, '0')}`;
      const monthDays = yearData.filter(d => d.date.startsWith(monthStr));
      let monthProd = 0;
      let monthTotal = 0;
      monthDays.forEach(d => {
        d.activities.forEach(a => {
          const dur = a.duration || 0;
          monthTotal += dur;
          const cat = a.category;
          categoryMinutes[cat] = (categoryMinutes[cat] || 0) + dur;
          if (productiveCategories.includes(cat)) {
            monthProd += dur;
            totalProductiveMin += dur;
          }
          totalTrackedMin += dur;
        });
      });
      const monthLabel = new Date(now.getFullYear(), m, 1).toLocaleDateString('en', { month: 'short' });
      monthlyData.push({ month: monthLabel, productive: Math.round(monthProd / 60), total: Math.round(monthTotal / 60) });
    }

    // Category pie data
    const categoryData = Object.entries(categoryMinutes)
      .map(([cat, mins]) => ({
        name: CATEGORY_LABELS[cat as ActivityCategory] || cat,
        value: Math.round(mins),
        color: CATEGORY_COLORS[cat as ActivityCategory] || 'hsl(0 0% 60%)',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Total distraction time this year
    const yearDistractions = distractionHistory.filter(d => {
      if (!d.startedAt) return false;
      return new Date(d.startedAt) >= yearStart;
    });
    const totalDistractionMin = yearDistractions
      .filter(d => d.userResponded && !d.isWorkRelated && d.durationSeconds)
      .reduce((sum, d) => sum + (d.durationSeconds || 0), 0) / 60;

    // Avg productive hours per day
    const avgProductivePerDay = daysTracked > 0 ? totalProductiveMin / daysTracked : 0;

    // Most productive month
    const bestMonth = monthlyData.reduce((best, m) => m.productive > best.productive ? m : best, monthlyData[0]);

    // Current streak
    let streak = 0;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sortedDates = yearData.filter(d => d.activities.length > 0).map(d => d.date).sort().reverse();
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date(now);
      expected.setDate(expected.getDate() - i);
      const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
      if (sortedDates[i] === expectedStr) streak++;
      else break;
    }

    return {
      daysTracked,
      totalActivities,
      totalProductiveMin,
      totalTrackedMin,
      totalDistractionMin,
      avgProductivePerDay,
      bestMonth,
      streak,
      monthlyData,
      categoryData,
      year: now.getFullYear(),
    };
  }, [allData, distractionHistory]);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
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
            <ActivityIcon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground">{stats.totalActivities}</p>
            <p className="text-xs text-muted-foreground">Activities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground">{formatDuration(stats.totalProductiveMin)}</p>
            <p className="text-xs text-muted-foreground">Productive time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground">{stats.streak}</p>
            <p className="text-xs text-muted-foreground">Day streak 🔥</p>
          </CardContent>
        </Card>
      </div>

      {/* Extra stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Avg/Day</p>
          <p className="text-sm font-bold text-foreground">{formatDuration(stats.avgProductivePerDay)}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Best Month</p>
          <p className="text-sm font-bold text-foreground">{stats.bestMonth?.month || '—'}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Distraction</p>
          <p className="text-sm font-bold text-foreground">{formatDuration(stats.totalDistractionMin)}</p>
        </div>
      </div>

      {/* Monthly productive hours chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly Productive Hours — {stats.year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" label={{ value: 'hrs', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [`${value}h`, '']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="productive" name="Productive" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="total" name="Total" fill="hsl(var(--primary) / 0.3)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category breakdown pie */}
      {stats.categoryData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Category Breakdown — {stats.year}</CardTitle>
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
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
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
