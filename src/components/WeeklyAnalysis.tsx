import React, { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, CATEGORY_LABELS, ActivityCategory } from '@/types/activity';
import { DayData } from '@/types/activity';
import { DistractionEvent } from '@/hooks/useAppUsageMonitor';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface WeeklyAnalysisProps {
  allData: DayData[];
  distractionHistory: DistractionEvent[];
  weekOffset?: number; // 0 = current week, 1 = last week, etc.
}

export const WeeklyAnalysis: React.FC<WeeklyAnalysisProps> = ({
  allData,
  distractionHistory,
  weekOffset = 0,
}) => {
  const { weekData, totalWork, totalDistraction, prevWeekWork, prevWeekDistraction, dailyBreakdown } = useMemo(() => {
    const now = new Date();
    const targetWeekStart = startOfWeek(subWeeks(now, weekOffset), { weekStartsOn: 1 });
    const targetWeekEnd = endOfWeek(subWeeks(now, weekOffset), { weekStartsOn: 1 });
    const prevWeekStart = startOfWeek(subWeeks(now, weekOffset + 1), { weekStartsOn: 1 });
    const prevWeekEnd = endOfWeek(subWeeks(now, weekOffset + 1), { weekStartsOn: 1 });

    const days = eachDayOfInterval({ start: targetWeekStart, end: targetWeekEnd });
    const prevDays = eachDayOfInterval({ start: prevWeekStart, end: prevWeekEnd });

    const productiveCategories = ['work', 'coding', 'meetings'];

    const getWeekMinutes = (daysList: Date[]) => {
      let work = 0;
      let distraction = 0;
      daysList.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayData = allData.find(d => d.date === dateStr);
        if (dayData) {
          dayData.activities.forEach(a => {
            const dur = Math.max(0, a.duration || 0);
            if (dur > 0) {
              if (productiveCategories.includes(a.category)) {
                work += dur;
              }
            }
          });
        }
        // Count distraction time
        distractionHistory.forEach(d => {
          if (d.startedAt) {
            const dDate = format(new Date(d.startedAt), 'yyyy-MM-dd');
            if (dDate === dateStr && !d.isWorkRelated && d.userResponded && d.durationSeconds) {
              distraction += Math.round(d.durationSeconds / 60);
            }
          }
        });
      });
      return { work, distraction };
    };

    const current = getWeekMinutes(days);
    const prev = getWeekMinutes(prevDays);

    const daily = days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayData = allData.find(d => d.date === dateStr);
      let workMins = 0;
      let distractionMins = 0;

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

      return {
        day: format(day, 'EEE'),
        date: format(day, 'MMM d'),
        work: Math.round(workMins / 60 * 10) / 10,
        distraction: Math.round(distractionMins / 60 * 10) / 10,
      };
    });

    return {
      weekData: { start: targetWeekStart, end: targetWeekEnd },
      totalWork: current.work,
      totalDistraction: current.distraction,
      prevWeekWork: prev.work,
      prevWeekDistraction: prev.distraction,
      dailyBreakdown: daily,
    };
  }, [allData, distractionHistory, weekOffset]);

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const workTrend = totalWork - prevWeekWork;
  const distractionTrend = totalDistraction - prevWeekDistraction;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {format(weekData.start, 'MMM d')} — {format(weekData.end, 'MMM d, yyyy')}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Work Hours</p>
            <p className="text-2xl font-bold">{formatHours(totalWork)}</p>
            <div className="flex items-center gap-1 mt-1">
              {workTrend > 0 ? (
                <TrendingUp className="h-3 w-3 text-chart-2" />
              ) : workTrend < 0 ? (
                <TrendingDown className="h-3 w-3 text-destructive" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {workTrend > 0 ? '+' : ''}{formatHours(Math.abs(workTrend))} vs last week
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Distraction</p>
            <p className="text-2xl font-bold">{formatHours(totalDistraction)}</p>
            <div className="flex items-center gap-1 mt-1">
              {distractionTrend < 0 ? (
                <TrendingDown className="h-3 w-3 text-chart-2" />
              ) : distractionTrend > 0 ? (
                <TrendingUp className="h-3 w-3 text-destructive" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {distractionTrend > 0 ? '+' : ''}{formatHours(Math.abs(distractionTrend))} vs last week
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyBreakdown}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v}h`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
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
