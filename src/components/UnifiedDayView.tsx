import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Clock, Layers } from 'lucide-react';
import { Activity, CATEGORY_COLORS, CATEGORY_LABELS, ActivityCategory } from '@/types/activity';
import { AppUsageLog } from '@/hooks/useAppUsage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ActivityTimeline } from './ActivityTimeline';
import { cn } from '@/lib/utils';

const APP_COLORS = [
  'hsl(260 60% 55%)', 'hsl(180 60% 45%)', 'hsl(30 80% 55%)',
  'hsl(340 70% 55%)', 'hsl(200 70% 50%)', 'hsl(100 50% 45%)',
  'hsl(50 80% 50%)', 'hsl(310 60% 50%)',
];

interface UnifiedEntry {
  id: string;
  type: 'activity' | 'app' | 'gap';
  label: string;
  category?: ActivityCategory;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  color: string;
  isOngoing?: boolean;
}

interface AppGroup {
  appName: string;
  totalSeconds: number;
  sessions: { startTime?: string; endTime?: string; durationSeconds: number }[];
  color: string;
}

interface UnifiedDayViewProps {
  activities: Activity[];
  appLogs: AppUsageLog[];
  selectedDate: string;
  onDeleteActivity: (id: string) => void;
  onUpdateActivity: (id: string, updates: Partial<Activity>) => void;
}

function fmtTime(date: Date): string {
  return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDur(mins: number): string {
  if (mins < 1) return '<1m';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getAppColor(appName: string, index: number): string {
  return APP_COLORS[index % APP_COLORS.length];
}

export const UnifiedDayView: React.FC<UnifiedDayViewProps> = ({ activities, appLogs, selectedDate, onDeleteActivity, onUpdateActivity }) => {

  // Build unified entries
  const { entries, appGroups, donutData, totalTrackedMinutes } = useMemo(() => {
    const allEntries: UnifiedEntry[] = [];
    const appColorMap = new Map<string, string>();
    let colorIdx = 0;

    // Activities
    activities.forEach(a => {
      if (!a.startTime) return;
      const start = new Date(a.startTime);
      const end = a.endTime ? new Date(a.endTime) : (a.isOngoing ? new Date() : start);
      const dur = (end.getTime() - start.getTime()) / 60000;
      if (dur <= 0 && !a.isOngoing) return;

      allEntries.push({
        id: a.id,
        type: 'activity',
        label: a.description,
        category: a.category,
        startTime: start,
        endTime: end,
        durationMinutes: Math.max(dur, 0),
        color: CATEGORY_COLORS[a.category] || 'hsl(0 0% 60%)',
        isOngoing: a.isOngoing,
      });
    });

    // App logs for selected date
    const dayLogs = appLogs.filter(l => l.usageDate === selectedDate);
    
    // Group apps
    const groups = new Map<string, AppGroup>();
    dayLogs.forEach(log => {
      if (!appColorMap.has(log.appName)) {
        appColorMap.set(log.appName, getAppColor(log.appName, colorIdx++));
      }
      const color = appColorMap.get(log.appName)!;

      if (!groups.has(log.appName)) {
        groups.set(log.appName, { appName: log.appName, totalSeconds: 0, sessions: [], color });
      }
      const g = groups.get(log.appName)!;
      g.totalSeconds += log.durationSeconds;
      g.sessions.push({
        startTime: log.startedAt,
        endTime: log.endedAt,
        durationSeconds: log.durationSeconds,
      });

    });

    // Sort by start time
    allEntries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Detect gaps (>5 min)
    const withGaps: UnifiedEntry[] = [];
    for (let i = 0; i < allEntries.length; i++) {
      if (i > 0) {
        const prevEnd = allEntries[i - 1].endTime.getTime();
        const currStart = allEntries[i].startTime.getTime();
        const gapMin = (currStart - prevEnd) / 60000;
        if (gapMin > 5) {
          withGaps.push({
            id: `gap-${i}`,
            type: 'gap',
            label: 'Untracked',
            startTime: new Date(prevEnd),
            endTime: new Date(currStart),
            durationMinutes: gapMin,
            color: 'hsl(var(--muted-foreground))',
          });
        }
      }
      withGaps.push(allEntries[i]);
    }

    // Donut data
    const categoryTotals = new Map<string, { name: string; value: number; color: string }>();
    activities.forEach(a => {
      if (!a.duration && !a.isOngoing) return;
      const dur = a.duration || (a.isOngoing ? (Date.now() - new Date(a.startTime).getTime()) / 60000 : 0);
      const key = `activity-${a.category}`;
      const existing = categoryTotals.get(key);
      if (existing) existing.value += dur;
      else categoryTotals.set(key, {
        name: CATEGORY_LABELS[a.category] || a.category,
        value: dur,
        color: CATEGORY_COLORS[a.category],
      });
    });

    groups.forEach(g => {
      categoryTotals.set(`app-${g.appName}`, {
        name: g.appName,
        value: g.totalSeconds / 60,
        color: g.color,
      });
    });

    const donut = Array.from(categoryTotals.values()).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
    const totalTracked = donut.reduce((s, d) => s + d.value, 0);

    // Add gap segment
    const gapMinutes = 24 * 60 - totalTracked;
    if (gapMinutes > 0) {
      donut.push({ name: 'Untracked', value: gapMinutes, color: 'hsl(var(--muted))' });
    }

    return {
      entries: withGaps,
      appGroups: Array.from(groups.values()).sort((a, b) => b.totalSeconds - a.totalSeconds),
      donutData: donut,
      totalTrackedMinutes: totalTracked,
    };
  }, [activities, appLogs, selectedDate]);

  const coveragePct = Math.min(100, Math.round((totalTrackedMinutes / (24 * 60)) * 100));

  return (
    <div className="space-y-4">
      {/* 24h Coverage */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-foreground">Day Coverage</span>
            <span className="text-sm font-bold text-primary tabular-nums">{fmtDur(totalTrackedMinutes)} / 24h</span>
          </div>
          <Progress value={coveragePct} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1">{coveragePct}% of your day is accounted for</p>
        </CardContent>
      </Card>

      {/* Donut + App Groups side by side on desktop */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Donut Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Full Day Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={1}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => fmtDur(value)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{fmtDur(totalTrackedMinutes)}</p>
                  <p className="text-[10px] text-muted-foreground">tracked</p>
                </div>
              </div>
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
              {donutData.filter(d => d.name !== 'Untracked').map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="truncate">{d.name}</span>
                  <span className="text-muted-foreground ml-auto tabular-nums">{fmtDur(d.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {appGroups.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Screen Time
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {appGroups.map(group => (
                <div key={group.appName} className="flex items-center gap-2.5 py-2 px-2 rounded-lg">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-primary-foreground" style={{ backgroundColor: group.color }}>
                    {group.appName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium truncate flex-1">{group.appName}</span>
                  <span className="text-sm font-bold tabular-nums">{fmtDur(group.totalSeconds / 60)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Full Day Breakdown — activities + apps + untracked */}
      {(activities.length > 0 || appGroups.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Day Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(() => {
                const allTotals = new Map<string, { label: string; minutes: number; color: string }>();

                // Manual activities by category
                activities.forEach(a => {
                  const dur = a.duration || (a.isOngoing ? (Date.now() - new Date(a.startTime).getTime()) / 60000 : 0);
                  if (dur <= 0) return;
                  const existing = allTotals.get(`cat-${a.category}`);
                  if (existing) existing.minutes += dur;
                  else allTotals.set(`cat-${a.category}`, {
                    label: CATEGORY_LABELS[a.category] || a.category,
                    minutes: dur,
                    color: CATEGORY_COLORS[a.category] || 'hsl(0 0% 60%)',
                  });
                });

                // App screen time
                appGroups.forEach(g => {
                  allTotals.set(`app-${g.appName}`, {
                    label: g.appName,
                    minutes: g.totalSeconds / 60,
                    color: g.color,
                  });
                });

                // Untracked
                const trackedMin = Array.from(allTotals.values()).reduce((s, t) => s + t.minutes, 0);
                const untrackedMin = 24 * 60 - trackedMin;
                if (untrackedMin > 5) {
                  allTotals.set('untracked', {
                    label: 'Untracked',
                    minutes: untrackedMin,
                    color: 'hsl(var(--muted-foreground))',
                  });
                }

                const sorted = Array.from(allTotals.values()).sort((a, b) => b.minutes - a.minutes);
                const maxMin = sorted[0]?.minutes || 1;
                return sorted.map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(item.minutes / maxMin) * 100}%`, backgroundColor: item.color }} />
                    </div>
                    <span className="text-sm font-bold tabular-nums w-16 text-right">{fmtDur(item.minutes)}</span>
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityTimeline
            activities={activities}
            onDelete={onDeleteActivity}
            onUpdate={onUpdateActivity}
          />
        </CardContent>
      </Card>
    </div>
  );
};
