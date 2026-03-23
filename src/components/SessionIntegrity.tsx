import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity } from '@/types/activity';
import { DistractionEvent } from '@/hooks/useAppUsageMonitor';
import { SnapshotSession } from './ScreentimeSnapshot';
import { Shield, Smartphone, AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SessionIntegrityProps {
  activities: Activity[];
  distractionHistory: DistractionEvent[];
  snapshotSessions: SnapshotSession[];
}

interface AppClassification {
  [appName: string]: 'productive' | 'distractive';
}

const SESSION_CLASSIFICATIONS_KEY = 'session-app-classifications';

function loadClassifications(): AppClassification {
  try {
    const stored = localStorage.getItem(SESSION_CLASSIFICATIONS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

function saveClassifications(data: AppClassification) {
  localStorage.setItem(SESSION_CLASSIFICATIONS_KEY, JSON.stringify(data));
}

export const SessionIntegrity: React.FC<SessionIntegrityProps> = ({
  activities,
  distractionHistory,
  snapshotSessions,
}) => {
  const [classifications, setClassifications] = useState<AppClassification>(loadClassifications);
  const [globalWorkApps, setGlobalWorkApps] = useState<Set<string>>(new Set());

  // Load global app classifications from backend
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('app_categories')
        .select('app_name, is_work_app')
        .eq('is_work_app', true);
      if (data) {
        setGlobalWorkApps(new Set(data.map(d => d.app_name.toLowerCase())));
      }
    };
    load();
  }, []);

  const isAppProductive = useCallback((appName: string): boolean => {
    // Per-session override takes priority
    const override = classifications[appName.toLowerCase()];
    if (override) return override === 'productive';
    // Then global setting
    return globalWorkApps.has(appName.toLowerCase());
  }, [classifications, globalWorkApps]);

  const toggleAppClassification = useCallback((appName: string) => {
    setClassifications(prev => {
      const key = appName.toLowerCase();
      const current = prev[key];
      const next: 'productive' | 'distractive' = current === 'productive' ? 'distractive' : 'productive';
      const updated: AppClassification = { ...prev, [key]: next };
      saveClassifications(updated);
      return updated;
    });
  }, []);

  const markGlobalProductive = useCallback(async (appName: string, productive: boolean) => {
    const lower = appName.toLowerCase();

    // Upsert into app_categories
    const { data: existing } = await supabase
      .from('app_categories')
      .select('id')
      .ilike('app_name', lower)
      .maybeSingle();

    if (existing) {
      await supabase.from('app_categories').update({ is_work_app: productive }).eq('id', existing.id);
    } else {
      await supabase.from('app_categories').insert({
        app_name: appName,
        package_name: lower.replace(/\s+/g, '.'),
        is_work_app: productive,
        category: productive ? 'work' : 'distraction',
      });
    }

    setGlobalWorkApps(prev => {
      const next = new Set(prev);
      if (productive) next.add(lower);
      else next.delete(lower);
      return next;
    });

    toast.success(`${appName} will always be marked as ${productive ? 'productive' : 'distractive'}`);
  }, []);

  const { totalLogged, actualWork, distractionTime, integrityPercent, appBreakdown } = useMemo(() => {
    const productiveCategories = ['work', 'coding', 'meetings'];

    const logged = activities
      .filter(a => a.duration && productiveCategories.includes(a.category))
      .reduce((sum, a) => sum + Math.max(0, a.duration || 0), 0);

    // Native distraction events
    const nativeDistraction = distractionHistory
      .filter(d => d.userResponded && !d.isWorkRelated && d.durationSeconds)
      .reduce((sum, d) => sum + Math.round((d.durationSeconds || 0) / 60), 0);

    // Snapshot-based distraction — only count apps classified as distractive
    const appTotals = new Map<string, number>();
    snapshotSessions.forEach(s => {
      s.diffs.forEach(d => {
        appTotals.set(d.appName, (appTotals.get(d.appName) || 0) + d.diffSeconds);
      });
    });

    let snapshotDistraction = 0;
    const breakdown: Array<{ name: string; seconds: number; isProductive: boolean }> = [];

    appTotals.forEach((secs, name) => {
      const productive = isAppProductive(name);
      breakdown.push({ name, seconds: secs, isProductive: productive });
      if (!productive) {
        snapshotDistraction += Math.round(secs / 60);
      }
    });

    breakdown.sort((a, b) => b.seconds - a.seconds);

    const totalDistraction = nativeDistraction + snapshotDistraction;
    const actual = Math.max(0, logged - totalDistraction);
    const percent = logged > 0 ? Math.round((actual / logged) * 100) : 100;

    return {
      totalLogged: logged,
      actualWork: actual,
      distractionTime: totalDistraction,
      integrityPercent: percent,
      appBreakdown: breakdown,
    };
  }, [activities, distractionHistory, snapshotSessions, isAppProductive]);

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
            <span className="font-medium text-foreground">{formatHours(distractionTime)}</span> lost to distractions during work sessions.
          </p>
        )}

        {appBreakdown.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <Smartphone className="h-3 w-3" /> App usage during work
            </p>
            <p className="text-[10px] text-muted-foreground">Tap to toggle • Long-press to set permanently</p>
            {appBreakdown.map(app => (
              <button
                key={app.name}
                onClick={() => toggleAppClassification(app.name)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  markGlobalProductive(app.name, !app.isProductive);
                }}
                className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded transition-colors ${
                  app.isProductive
                    ? 'bg-chart-2/10 hover:bg-chart-2/20'
                    : 'bg-destructive/5 hover:bg-destructive/10'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {app.isProductive ? (
                    <CheckCircle2 className="h-3 w-3 text-chart-2" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                  )}
                  {app.name}
                  <Badge variant="outline" className="text-[9px] h-4 px-1">
                    {app.isProductive ? 'productive' : 'distractive'}
                  </Badge>
                  {globalWorkApps.has(app.name.toLowerCase()) && (
                    <Settings2 className="h-2.5 w-2.5 text-muted-foreground" />
                  )}
                </span>
                <span className={`font-medium ${app.isProductive ? 'text-chart-2' : 'text-destructive'}`}>
                  {fmtSec(app.seconds)}
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
