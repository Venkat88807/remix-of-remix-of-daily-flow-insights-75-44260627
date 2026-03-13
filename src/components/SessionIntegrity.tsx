import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity } from '@/types/activity';
import { DistractionEvent } from '@/hooks/useAppUsageMonitor';
import { SnapshotSession } from './ScreentimeSnapshot';
import { Shield, Smartphone, AlertTriangle } from 'lucide-react';

interface SessionIntegrityProps {
  activities: Activity[];
  distractionHistory: DistractionEvent[];
  snapshotSessions: SnapshotSession[];
}

export const SessionIntegrity: React.FC<SessionIntegrityProps> = ({
  activities,
  distractionHistory,
  snapshotSessions,
}) => {
  const { totalLogged, actualWork, distractionTime, snapshotDistractionTime, integrityPercent, topDistractions } = useMemo(() => {
    const productiveCategories = ['work', 'coding', 'meetings'];

    const logged = activities
      .filter(a => a.duration && productiveCategories.includes(a.category))
      .reduce((sum, a) => sum + (a.duration || 0), 0);

    // Native distraction events
    const nativeDistraction = distractionHistory
      .filter(d => d.userResponded && !d.isWorkRelated && d.durationSeconds)
      .reduce((sum, d) => sum + Math.round((d.durationSeconds || 0) / 60), 0);

    // Snapshot-based distraction (already in seconds, convert to minutes)
    const snapshotDistraction = snapshotSessions
      .reduce((sum, s) => sum + Math.round(s.totalDistractionSeconds / 60), 0);

    const totalDistraction = nativeDistraction + snapshotDistraction;
    const actual = Math.max(0, logged - totalDistraction);
    const percent = logged > 0 ? Math.round((actual / logged) * 100) : 100;

    // Top distracting apps from snapshots
    const appTotals = new Map<string, number>();
    snapshotSessions.forEach(s => {
      s.diffs.forEach(d => {
        appTotals.set(d.appName, (appTotals.get(d.appName) || 0) + d.diffSeconds);
      });
    });
    const top = Array.from(appTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, secs]) => ({ name, seconds: secs }));

    return {
      totalLogged: logged,
      actualWork: actual,
      distractionTime: totalDistraction,
      snapshotDistractionTime: snapshotDistraction,
      integrityPercent: percent,
      topDistractions: top,
    };
  }, [activities, distractionHistory, snapshotSessions]);

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const fmtSec = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  if (totalLogged === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          Session Integrity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold">{integrityPercent}%</p>
            <p className="text-xs text-muted-foreground">actual work done</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Logged: {formatHours(totalLogged)}</p>
            <p>Actual: {formatHours(actualWork)}</p>
          </div>
        </div>

        <Progress value={integrityPercent} className="h-2" />

        {distractionTime > 0 && (
          <p className="text-sm text-muted-foreground">
            You logged <span className="font-medium text-foreground">{formatHours(totalLogged)}</span> but actual work was <span className="font-medium text-foreground">{formatHours(actualWork)}</span> ({integrityPercent}%) due to <span className="font-medium text-foreground">{formatHours(distractionTime)}</span> of distractions.
          </p>
        )}

        {topDistractions.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <Smartphone className="h-3 w-3" /> Top distracting apps
            </p>
            {topDistractions.map(app => (
              <div key={app.name} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-destructive/5">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  {app.name}
                </span>
                <span className="font-medium text-destructive">{fmtSec(app.seconds)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
