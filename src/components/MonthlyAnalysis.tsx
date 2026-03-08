import React, { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, subMonths, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DayData } from '@/types/activity';
import { DistractionEvent } from '@/hooks/useAppUsageMonitor';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MonthlyAnalysisProps {
  allData: DayData[];
  distractionHistory: DistractionEvent[];
  monthOffset?: number; // 0 = current month, 1 = last month
}

export const MonthlyAnalysis: React.FC<MonthlyAnalysisProps> = ({
  allData,
  distractionHistory,
  monthOffset = 0,
}) => {
  const { monthData, weeklyBreakdown, totalWork, totalDistraction, prevMonthWork, prevMonthDistraction, integrityPercentage } = useMemo(() => {
    const now = new Date();
    const targetMonth = subMonths(now, monthOffset);
    const monthStart = startOfMonth(targetMonth);
    const monthEnd = endOfMonth(targetMonth);
    const prevMonth = subMonths(now, monthOffset + 1);
    const prevMonthStart = startOfMonth(prevMonth);
    const prevMonthEnd = endOfMonth(prevMonth);

    const productiveCategories = ['work', 'coding', 'meetings'];

    const getMonthStats = (start: Date, end: Date) => {
      const days = eachDayOfInterval({ start, end });
      let work = 0;
      let distraction = 0;
      let totalLogged = 0;

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayData = allData.find(d => d.date === dateStr);
        if (dayData) {
          dayData.activities.forEach(a => {
            if (a.duration) {
              totalLogged += a.duration;
              if (productiveCategories.includes(a.category)) {
                work += a.duration;
              }
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

      return { work, distraction, totalLogged };
    };

    const current = getMonthStats(monthStart, monthEnd);
    const prev = getMonthStats(prevMonthStart, prevMonthEnd);

    // Weekly breakdown within the month
    const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });
    const weekly = weeks.map((weekStart, i) => {
      const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const effectiveEnd = wEnd > monthEnd ? monthEnd : wEnd;
      const effectiveStart = weekStart < monthStart ? monthStart : weekStart;
      const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
      
      let workMins = 0;
      let distractionMins = 0;

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayData = allData.find(d => d.date === dateStr);
        if (dayData) {
          dayData.activities.forEach(a => {
            if (a.duration && productiveCategories.includes(a.category)) {
              workMins += a.duration;
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

      return {
        week: `W${i + 1}`,
        label: `${format(effectiveStart, 'MMM d')}–${format(effectiveEnd, 'd')}`,
        work: Math.round(workMins / 60 * 10) / 10,
        distraction: Math.round(distractionMins / 60 * 10) / 10,
      };
    });

    // Integrity = productive work / (productive work + distraction time)
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
    };
  }, [allData, distractionHistory, monthOffset]);

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const workTrend = totalWork - prevMonthWork;
  const distractionTrend = totalDistraction - prevMonthDistraction;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {format(monthData.start, 'MMMM yyyy')}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
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
