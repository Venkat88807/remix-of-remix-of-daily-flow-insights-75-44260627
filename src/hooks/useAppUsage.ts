import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

export interface AppUsageLog {
  id: string;
  packageName?: string;
  appName: string;
  durationSeconds: number;
  usageDate: string;
  source: 'manual' | 'auto';
  startedAt?: string;
  endedAt?: string;
  notes?: string;
}

export interface AppUsageLimit {
  id: string;
  appName: string;
  packageName?: string;
  dailyLimitMinutes?: number;
  monthlyLimitMinutes?: number;
  isActive: boolean;
}

export interface AppDailySummary {
  appName: string;
  totalSeconds: number;
  dailyLimitMinutes?: number;
  monthlyLimitMinutes?: number;
  monthlyTotalSeconds: number;
}

export function useAppUsage() {
  const [logs, setLogs] = useState<AppUsageLog[]>([]);
  const [limits, setLimits] = useState<AppUsageLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const loadLogs = useCallback(async () => {
    // Only load logs from the last 90 days for performance
    const cutoff = format(subDays(new Date(), 90), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('app_usage_logs')
      .select('*')
      .gte('usage_date', cutoff)
      .order('usage_date', { ascending: false });

    if (!error && data) {
      setLogs(data.map(d => ({
        id: d.id,
        packageName: d.package_name ?? undefined,
        appName: d.app_name,
        durationSeconds: d.duration_seconds,
        usageDate: d.usage_date,
        source: d.source as 'manual' | 'auto',
        startedAt: d.started_at ?? undefined,
        endedAt: d.ended_at ?? undefined,
        notes: d.notes ?? undefined,
      })));
    }
    setLoading(false);
  }, []);

  const loadLimits = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_usage_limits')
      .select('*');

    if (!error && data) {
      setLimits(data.map(d => ({
        id: d.id,
        appName: d.app_name,
        packageName: d.package_name ?? undefined,
        dailyLimitMinutes: d.daily_limit_minutes ?? undefined,
        monthlyLimitMinutes: d.monthly_limit_minutes ?? undefined,
        isActive: d.is_active,
      })));
    }
  }, []);

  useEffect(() => {
    loadLogs();
    loadLimits();
  }, [loadLogs, loadLimits]);

  const addManualLog = useCallback(async (appName: string, durationMinutes: number, date: string, notes?: string) => {
    const { error } = await supabase
      .from('app_usage_logs')
      .insert({
        app_name: appName,
        duration_seconds: durationMinutes * 60,
        usage_date: date,
        source: 'manual',
        notes,
      });

    if (!error) {
      await loadLogs();
      return true;
    }
    return false;
  }, [loadLogs]);

  const deleteLog = useCallback(async (id: string) => {
    await supabase.from('app_usage_logs').delete().eq('id', id);
    await loadLogs();
  }, [loadLogs]);

  const upsertLimit = useCallback(async (appName: string, dailyMinutes?: number, monthlyMinutes?: number) => {
    const { error } = await supabase
      .from('app_usage_limits')
      .upsert({
        app_name: appName,
        daily_limit_minutes: dailyMinutes ?? null,
        monthly_limit_minutes: monthlyMinutes ?? null,
        is_active: true,
      }, { onConflict: 'app_name' });

    if (!error) {
      await loadLimits();
      return true;
    }
    return false;
  }, [loadLimits]);

  const deleteLimit = useCallback(async (id: string) => {
    await supabase.from('app_usage_limits').delete().eq('id', id);
    await loadLimits();
  }, [loadLimits]);

  // Daily summary for selected date
  const dailySummary = useMemo((): AppDailySummary[] => {
    const dayLogs = logs.filter(l => l.usageDate === selectedDate);
    const monthPrefix = selectedDate.substring(0, 7);
    const monthLogs = logs.filter(l => l.usageDate.startsWith(monthPrefix));

    const appMap = new Map<string, { daily: number; monthly: number }>();

    dayLogs.forEach(l => {
      const existing = appMap.get(l.appName) || { daily: 0, monthly: 0 };
      existing.daily += l.durationSeconds;
      appMap.set(l.appName, existing);
    });

    monthLogs.forEach(l => {
      const existing = appMap.get(l.appName) || { daily: 0, monthly: 0 };
      existing.monthly += l.durationSeconds;
      appMap.set(l.appName, existing);
    });

    // Include apps with limits even if no usage
    limits.forEach(lim => {
      if (!appMap.has(lim.appName)) {
        appMap.set(lim.appName, { daily: 0, monthly: 0 });
      }
    });

    return Array.from(appMap.entries()).map(([appName, data]) => {
      const limit = limits.find(l => l.appName === appName);
      return {
        appName,
        totalSeconds: data.daily,
        dailyLimitMinutes: limit?.dailyLimitMinutes,
        monthlyLimitMinutes: limit?.monthlyLimitMinutes,
        monthlyTotalSeconds: data.monthly,
      };
    }).sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [logs, limits, selectedDate]);

  // Monthly stats
  const monthlyStats = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const year = now.getFullYear();
      const monthPrefix = `${year}-${String(i + 1).padStart(2, '0')}`;
      const monthLogs = logs.filter(l => l.usageDate.startsWith(monthPrefix));
      const appTotals = new Map<string, number>();
      monthLogs.forEach(l => {
        appTotals.set(l.appName, (appTotals.get(l.appName) || 0) + l.durationSeconds);
      });
      const label = new Date(year, i, 1).toLocaleDateString('en', { month: 'short' });
      return {
        month: label,
        monthNum: i,
        totalSeconds: monthLogs.reduce((sum, l) => sum + l.durationSeconds, 0),
        apps: Array.from(appTotals.entries())
          .map(([name, secs]) => ({ appName: name, totalSeconds: secs }))
          .sort((a, b) => b.totalSeconds - a.totalSeconds),
      };
    });
  }, [logs]);

  // All-time unique app names
  const allAppNames = useMemo(() => {
    const names = new Set<string>();
    logs.forEach(l => names.add(l.appName));
    limits.forEach(l => names.add(l.appName));
    return Array.from(names).sort();
  }, [logs, limits]);

  return {
    logs,
    limits,
    loading,
    selectedDate,
    setSelectedDate,
    dailySummary,
    monthlyStats,
    allAppNames,
    addManualLog,
    deleteLog,
    upsertLimit,
    deleteLimit,
    loadLogs,
  };
}
