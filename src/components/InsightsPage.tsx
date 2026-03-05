import React, { useMemo, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend,
} from 'recharts';
import { format, subDays, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, eachWeekOfInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DayData, CATEGORY_COLORS, CATEGORY_LABELS, ActivityCategory } from '@/types/activity';
import { DistractionEvent } from '@/hooks/useAppUsageMonitor';
import { TrendingUp, TrendingDown, Minus, Clock, CalendarDays, Flame, BarChart3, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface InsightsPageProps {
  allData: DayData[];
  distractionHistory: DistractionEvent[];
}

const PRODUCTIVE_CATS = ['work', 'coding', 'meetings'];

function fmtDur(mins: number): string {
  if (mins < 1) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtHMS(mins: number): string {
  const totalSecs = Math.round(mins * 60);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const CHART_COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(260 60% 55%)',
  'hsl(180 60% 45%)', 'hsl(30 80% 55%)',
];

// ===== PERIOD VIEW =====
const PeriodView: React.FC<InsightsPageProps> = ({ allData, distractionHistory }) => {
  const [periodDays, setPeriodDays] = useState(28);

  const stats = useMemo(() => {
    const now = new Date();
    const periodStart = subDays(now, periodDays - 1);
    const days = eachDayOfInterval({ start: periodStart, end: now });

    let totalMin = 0;
    let daysWithData = 0;
    const catMins: Record<string, number> = {};
    const dailyTotals: { date: string; label: string; minutes: number }[] = [];
    const cumulativeData: { day: number; total: number }[] = [];
    let runningTotal = 0;

    // Per-day-of-week aggregation
    const dowTotals: number[] = [0, 0, 0, 0, 0, 0, 0];
    const dowCounts: number[] = [0, 0, 0, 0, 0, 0, 0];

    // Hourly focus time
    const hourlyFocus: number[] = new Array(24).fill(0);
    let hourlyDayCount = 0;

    days.forEach((day, idx) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayData = allData.find(d => d.date === dateStr);
      let dayMin = 0;
      const dow = (day.getDay() + 6) % 7; // Mon=0

      if (dayData && dayData.activities.length > 0) {
        daysWithData++;
        hourlyDayCount++;
        dayData.activities.forEach(a => {
          const dur = a.duration || 0;
          dayMin += dur;
          const cat = a.category;
          catMins[cat] = (catMins[cat] || 0) + dur;

          // Hourly breakdown
          if (dur > 0 && a.startTime) {
            const startH = new Date(a.startTime).getHours();
            const endH = a.endTime ? new Date(a.endTime).getHours() : startH;
            for (let h = startH; h <= Math.min(endH, 23); h++) {
              hourlyFocus[h] += Math.min(dur, 60) / Math.max(1, endH - startH + 1);
            }
          }
        });
      }

      totalMin += dayMin;
      dowTotals[dow] += dayMin;
      dowCounts[dow]++;
      runningTotal += dayMin;

      dailyTotals.push({
        date: dateStr,
        label: format(day, 'M/d'),
        minutes: dayMin,
      });
      cumulativeData.push({ day: idx + 1, total: Math.round(runningTotal / 60 * 10) / 10 });
    });

    const avgDaily = daysWithData > 0 ? totalMin / daysWithData : 0;

    // Category pie
    const categoryData = Object.entries(catMins)
      .map(([cat, mins]) => ({
        name: CATEGORY_LABELS[cat as ActivityCategory] || cat,
        value: Math.round(mins),
        pct: totalMin > 0 ? Math.round((mins / totalMin) * 100) : 0,
        color: CATEGORY_COLORS[cat as ActivityCategory] || 'hsl(0 0% 60%)',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Avg per day of week
    const dowLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const avgPerDow = dowLabels.map((label, i) => ({
      day: label,
      avgMinutes: dowCounts[i] > 0 ? Math.round(dowTotals[i] / dowCounts[i]) : 0,
    }));

    // Avg hourly focus
    const hourlyAvg = hourlyFocus.map((total, h) => ({
      hour: h,
      avgMin: hourlyDayCount > 0 ? Math.round(total / hourlyDayCount * 10) / 10 : 0,
    })).filter(h => h.hour >= 5 || h.avgMin > 0);

    // Daily max
    const dailyMax = dailyTotals.reduce((max, d) => d.minutes > max ? d.minutes : max, 0);

    return { totalMin, avgDaily, daysWithData, categoryData, dailyTotals, cumulativeData, avgPerDow, hourlyAvg, dailyMax, periodDays };
  }, [allData, periodDays]);

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[7, 14, 28, 90].map(d => (
          <button
            key={d}
            onClick={() => setPeriodDays(d)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
              periodDays === d
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {d === 7 ? '7 Days' : d === 14 ? '14 Days' : d === 28 ? '28 Days' : '90 Days'}
          </button>
        ))}
      </div>

      {/* Total Time / Daily Average */}
      <Card>
        <CardContent className="py-5">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-wider">Total Time</p>
              <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{fmtHMS(stats.totalMin)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-wider">Daily Average</p>
              <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{fmtHMS(stats.avgDaily)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Ratio (Donut) */}
      {stats.categoryData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Category Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="h-44 w-44 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2}>
                      {stats.categoryData.map((entry, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmtDur(v), '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5 min-w-0">
                {stats.categoryData.map((cat, i) => (
                  <div key={cat.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-foreground font-medium truncate">{cat.name}</span>
                    <span className="text-muted-foreground ml-auto whitespace-nowrap">{fmtDur(cat.value)} · {cat.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}




      {/* Avg Time per Day of Week */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Avg Time per Day</CardTitle>
          <p className="text-xs text-muted-foreground">Daily Max: {fmtDur(stats.dailyMax)}</p>
        </CardHeader>
        <CardContent>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.avgPerDow}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={v => fmtDur(v)} />
                <Tooltip formatter={(v: number) => [fmtDur(v), 'Avg']} contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="avgMinutes" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]}>
                  {stats.avgPerDow.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Time per Day (daily bar) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Time per Day</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.dailyTotals}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 8 }} interval="preserveStartEnd" className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 9 }} className="fill-muted-foreground" tickFormatter={v => fmtDur(v)} />
                <Tooltip formatter={(v: number) => [fmtDur(v), 'Time']} contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ===== MONTH VIEW =====
const MonthView: React.FC<InsightsPageProps> = ({ allData }) => {
  const [yearOffset, setYearOffset] = useState(0);
  const now = new Date();
  const year = now.getFullYear() - yearOffset;

  const monthlyStats = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const prefix = `${year}-${String(m + 1).padStart(2, '0')}`;
      const monthDays = allData.filter(d => d.date.startsWith(prefix));
      let totalMin = 0;
      let daysActive = 0;
      monthDays.forEach(d => {
        if (d.activities.length > 0) daysActive++;
        d.activities.forEach(a => { totalMin += a.duration || 0; });
      });
      const label = new Date(year, m, 1).toLocaleDateString('en', { month: 'short' });
      return { month: label, monthNum: m, totalMin, daysActive, avgDaily: daysActive > 0 ? totalMin / daysActive : 0 };
    });
  }, [allData, year]);

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const sel = monthlyStats[selectedMonth];

  return (
    <div className="space-y-4">
      {/* Year nav */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => setYearOffset(y => y + 1)} className="text-muted-foreground hover:text-foreground text-lg">◀</button>
        <span className="text-lg font-bold text-foreground">{year}</span>
        <button onClick={() => setYearOffset(y => Math.max(0, y - 1))} className="text-muted-foreground hover:text-foreground text-lg" disabled={yearOffset === 0}>▶</button>
      </div>

      {/* Month grid */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-4 gap-2">
            {monthlyStats.map((m, i) => (
              <button
                key={m.month}
                onClick={() => setSelectedMonth(i)}
                className={`p-2 rounded-lg text-center transition-colors ${
                  i === selectedMonth ? 'bg-primary/20 ring-1 ring-primary' : 'bg-muted/40 hover:bg-muted/60'
                }`}
              >
                <p className="text-xs font-medium text-foreground">{m.month}</p>
                {m.totalMin > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{fmtHMS(m.totalMin)}</p>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Selected month details */}
      <Card>
        <CardContent className="py-5">
          <p className="text-sm text-center text-muted-foreground">{monthlyStats[selectedMonth]?.month} {year}</p>
          <div className="grid grid-cols-2 gap-4 text-center mt-3">
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-wider">Total Time</p>
              <p className="text-2xl font-bold text-foreground">{fmtHMS(sel.totalMin)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-wider">Daily Average</p>
              <p className="text-2xl font-bold text-foreground">{fmtHMS(sel.avgDaily)}</p>
            </div>
          </div>
          <div className="flex justify-center gap-6 mt-3 text-xs text-muted-foreground">
            <span>{sel.daysActive} days active</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ===== TREND VIEW =====
const TrendView: React.FC<InsightsPageProps> = ({ allData }) => {
  const now = new Date();

  const trendData = useMemo(() => {
    // Daily trend (last 14 days)
    const dailyData = Array.from({ length: 14 }, (_, i) => {
      const day = subDays(now, 13 - i);
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayData = allData.find(d => d.date === dateStr);
      let total = 0;
      if (dayData) dayData.activities.forEach(a => { total += a.duration || 0; });
      return { label: format(day, 'M/d'), minutes: total };
    });
    const dailyMax = dailyData.reduce((m, d) => d.minutes > m ? d.minutes : m, 0);

    // Weekly trend (last 8 weeks)
    const weeklyData = Array.from({ length: 8 }, (_, i) => {
      const weekEnd = subDays(now, i * 7);
      const weekStart = subDays(weekEnd, 6);
      const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
      let total = 0;
      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayData = allData.find(d => d.date === dateStr);
        if (dayData) dayData.activities.forEach(a => { total += a.duration || 0; });
      });
      return { label: `${format(weekStart, 'M/d')}~`, minutes: total };
    }).reverse();
    const weeklyMax = weeklyData.reduce((m, d) => d.minutes > m ? d.minutes : m, 0);

    // Monthly trend (last 6 months)
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const month = subMonths(now, 5 - i);
      const prefix = format(month, 'yyyy-MM');
      const monthDays = allData.filter(d => d.date.startsWith(prefix));
      let total = 0;
      monthDays.forEach(d => d.activities.forEach(a => { total += a.duration || 0; }));
      return { label: format(month, 'MMM'), minutes: total };
    });
    const monthlyMax = monthlyData.reduce((m, d) => d.minutes > m ? d.minutes : m, 0);

    // Per-category monthly stacked
    const categories = new Set<string>();
    allData.forEach(d => d.activities.forEach(a => categories.add(a.category)));
    const catList = Array.from(categories);

    const monthlyStacked = Array.from({ length: 6 }, (_, i) => {
      const month = subMonths(now, 5 - i);
      const prefix = format(month, 'yyyy-MM');
      const monthDays = allData.filter(d => d.date.startsWith(prefix));
      const entry: Record<string, any> = { label: format(month, 'MMM') };
      catList.forEach(cat => { entry[cat] = 0; });
      monthDays.forEach(d => d.activities.forEach(a => {
        entry[a.category] = (entry[a.category] || 0) + Math.round((a.duration || 0) / 60 * 10) / 10;
      }));
      return entry;
    });

    return { dailyData, dailyMax, weeklyData, weeklyMax, monthlyData, monthlyMax, monthlyStacked, catList };
  }, [allData]);

  return (
    <div className="space-y-4">
      {/* Daily Trend */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Daily Max: {fmtDur(trendData.dailyMax)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData.dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 8 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9 }} className="fill-muted-foreground" tickFormatter={v => fmtDur(v)} />
                <Tooltip formatter={(v: number) => [fmtDur(v), '']} contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="minutes" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Trend */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Weekly Max: {fmtDur(trendData.weeklyMax)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData.weeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 8 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 9 }} className="fill-muted-foreground" tickFormatter={v => fmtDur(v)} />
                <Tooltip formatter={(v: number) => [fmtDur(v), '']} contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="minutes" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Trend (stacked by category) */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Monthly Max: {fmtDur(trendData.monthlyMax)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData.monthlyStacked}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 9 }} className="fill-muted-foreground" tickFormatter={v => `${v}h`} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {trendData.catList.slice(0, 6).map((cat, i) => (
                  <Bar
                    key={cat}
                    dataKey={cat}
                    name={CATEGORY_LABELS[cat as ActivityCategory] || cat}
                    stackId="a"
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    radius={i === trendData.catList.slice(0, 6).length - 1 ? [2, 2, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ===== REPORT GENERATOR =====
function generateReport(allData: DayData[]): string {
  const now = new Date();
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════');
  lines.push('       TIME TRACKER — ACTIVITY REPORT');
  lines.push(`       Generated: ${format(now, 'MMMM d, yyyy h:mm a')}`);
  lines.push('═══════════════════════════════════════');
  lines.push('');

  // Last 28 days summary
  const periodStart = subDays(now, 27);
  const days = eachDayOfInterval({ start: periodStart, end: now });
  let totalMin = 0;
  let daysWithData = 0;
  const catMins: Record<string, number> = {};
  const dailyTotals: { date: string; minutes: number }[] = [];

  days.forEach(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayData = allData.find(d => d.date === dateStr);
    let dayMin = 0;
    if (dayData && dayData.activities.length > 0) {
      daysWithData++;
      dayData.activities.forEach(a => {
        const dur = a.duration || 0;
        dayMin += dur;
        catMins[a.category] = (catMins[a.category] || 0) + dur;
      });
    }
    totalMin += dayMin;
    dailyTotals.push({ date: dateStr, minutes: dayMin });
  });

  const avgDaily = daysWithData > 0 ? totalMin / daysWithData : 0;
  const maxDay = dailyTotals.reduce((max, d) => d.minutes > max.minutes ? d : max, dailyTotals[0]);

  lines.push('📊 LAST 28 DAYS OVERVIEW');
  lines.push('───────────────────────────────────────');
  lines.push(`  Total tracked time:   ${fmtHMS(totalMin)}`);
  lines.push(`  Days with entries:    ${daysWithData} / ${days.length}`);
  lines.push(`  Daily average:        ${fmtHMS(avgDaily)}`);
  lines.push(`  Most active day:      ${maxDay?.date} (${fmtDur(maxDay?.minutes || 0)})`);
  lines.push('');

  // Category breakdown
  const sortedCats = Object.entries(catMins).sort((a, b) => b[1] - a[1]);
  lines.push('📂 CATEGORY BREAKDOWN');
  lines.push('───────────────────────────────────────');
  const maxCatLen = Math.max(...sortedCats.map(([c]) => (CATEGORY_LABELS[c as ActivityCategory] || c).length));
  sortedCats.forEach(([cat, mins]) => {
    const label = (CATEGORY_LABELS[cat as ActivityCategory] || cat).padEnd(maxCatLen + 2);
    const pct = totalMin > 0 ? Math.round((mins / totalMin) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 3)) + '░'.repeat(Math.max(0, 33 - Math.round(pct / 3)));
    lines.push(`  ${label} ${fmtDur(mins).padStart(8)}  ${String(pct).padStart(3)}%  ${bar}`);
  });
  lines.push('');

  // Weekly breakdown
  lines.push('📅 WEEKLY BREAKDOWN');
  lines.push('───────────────────────────────────────');
  for (let i = 0; i < 4; i++) {
    const weekEnd = subDays(now, i * 7);
    const weekStart = subDays(weekEnd, 6);
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    let weekTotal = 0;
    let weekActive = 0;
    weekDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayData = allData.find(d => d.date === dateStr);
      if (dayData && dayData.activities.length > 0) {
        weekActive++;
        dayData.activities.forEach(a => { weekTotal += a.duration || 0; });
      }
    });
    const label = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`;
    lines.push(`  ${label.padEnd(22)} ${fmtHMS(weekTotal).padStart(9)}   (${weekActive} days active)`);
  }
  lines.push('');

  // Daily log for last 7 days
  lines.push('📋 LAST 7 DAYS DETAIL');
  lines.push('───────────────────────────────────────');
  const last7 = days.slice(-7);
  last7.forEach(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayData = allData.find(d => d.date === dateStr);
    lines.push(`  ${format(day, 'EEE, MMM d')}:`);
    if (!dayData || dayData.activities.length === 0) {
      lines.push('    (no entries)');
    } else {
      const sorted = [...dayData.activities].sort((a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      sorted.forEach(a => {
        const start = format(new Date(a.startTime), 'h:mm a');
        const end = a.endTime ? format(new Date(a.endTime), 'h:mm a') : 'ongoing';
        const cat = CATEGORY_LABELS[a.category as ActivityCategory] || a.category;
        lines.push(`    ${start} → ${end}  ${a.description} [${cat}] ${fmtDur(a.duration || 0)}`);
      });
    }
    lines.push('');
  });

  lines.push('═══════════════════════════════════════');
  lines.push('  End of Report');
  lines.push('═══════════════════════════════════════');
  return lines.join('\n');
}

// ===== MAIN INSIGHTS =====
export const InsightsPage: React.FC<InsightsPageProps> = (props) => {
  const handleExportReport = useCallback(() => {
    const report = generateReport(props.allData);
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `time-tracker-report-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported!');
  }, [props.allData]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportReport} className="gap-2">
          <FileText className="h-4 w-4" /> Export Report
        </Button>
      </div>
      <PeriodView {...props} />
      <MonthView {...props} />
      <TrendView {...props} />
    </div>
  );
};
