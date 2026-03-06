import React, { useState, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { Smartphone, Plus, Target, BarChart3, Trash2, Clock, TrendingUp, Zap, AlertTriangle, Camera, Upload, Loader2, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { useAppUsage } from '@/hooks/useAppUsage';
import { WhitelistApps } from '@/components/WhitelistApps';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(260 60% 55%)',
  'hsl(180 60% 45%)', 'hsl(30 80% 55%)',
];

function fmtDur(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

const CollapsibleAppGroup: React.FC<{
  appName: string;
  logs: Array<{ id: string; durationSeconds: number; source: string; notes?: string; startedAt?: string; endedAt?: string }>;
  totalSeconds: number;
  color: string;
  onDeleteLog: (id: string) => void;
}> = ({ appName, logs, totalSeconds, color, onDeleteLog }) => {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between text-sm py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="font-medium">{appName}</span>
            <span className="text-xs text-muted-foreground">×{logs.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold tabular-nums">{fmtDur(totalSeconds)}</span>
            {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 border-l-2 border-border pl-3 space-y-0.5">
          {logs.map(log => (
            <div key={log.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/30">
              <div>
                <span className="text-muted-foreground">{fmtDur(log.durationSeconds)}</span>
                {log.startedAt && (
                  <span className="ml-2 text-muted-foreground">
                    {new Date(log.startedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    {log.endedAt && ` – ${new Date(log.endedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: true })}`}
                  </span>
                )}
                {log.source === 'manual' && <span className="bg-muted px-1 py-0.5 rounded ml-1">manual</span>}
                {log.notes && <p className="text-muted-foreground mt-0.5">{log.notes}</p>}
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDeleteLog(log.id); }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const AppUsagePage: React.FC = () => {
  const {
    dailySummary, monthlyStats, allAppNames, limits,
    addManualLog, deleteLog, upsertLimit, deleteLimit,
    selectedDate, setSelectedDate, logs, loading, loadLogs,
  } = useAppUsage();

  const [showAddLog, setShowAddLog] = useState(false);
  const [showAddLimit, setShowAddLimit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedEntries, setParsedEntries] = useState<Array<{ appName: string; time?: string | null; durationSeconds: number; selected: boolean }>>([]);
  const [importDate, setImportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logForm, setLogForm] = useState({ appName: '', hours: '', minutes: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
  const [limitForm, setLimitForm] = useState({ appName: '', dailyMinutes: '', monthlyHours: '' });

  const handleAddLog = async () => {
    const mins = (parseInt(logForm.hours || '0') * 60) + parseInt(logForm.minutes || '0');
    if (!logForm.appName.trim() || mins <= 0) {
      toast.error('Enter app name and duration');
      return;
    }
    const ok = await addManualLog(logForm.appName.trim(), mins, logForm.date, logForm.notes || undefined);
    if (ok) {
      toast.success(`Added ${logForm.appName} usage`);
      setShowAddLog(false);
      setLogForm({ appName: '', hours: '', minutes: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
    }
  };

  const handleAddLimit = async () => {
    if (!limitForm.appName.trim()) { toast.error('Enter app name'); return; }
    const daily = limitForm.dailyMinutes ? parseInt(limitForm.dailyMinutes) : undefined;
    const monthly = limitForm.monthlyHours ? parseInt(limitForm.monthlyHours) * 60 : undefined;
    if (!daily && !monthly) { toast.error('Set at least one limit'); return; }
    const ok = await upsertLimit(limitForm.appName.trim(), daily, monthly);
    if (ok) {
      toast.success(`Limit set for ${limitForm.appName}`);
      setShowAddLimit(false);
      setLimitForm({ appName: '', dailyMinutes: '', monthlyHours: '' });
    }
  };

  const handleScreenshotParse = async (file: File) => {
    setImporting(true);
    setParsedEntries([]);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('parse-app-usage-screenshot', {
        body: { imageBase64: base64, date: importDate },
      });

      if (error) throw error;
      if (!data?.entries?.length) {
        toast.info('No usable entries found in screenshot (0-sec entries are filtered)');
        setImporting(false);
        return;
      }

      setParsedEntries(data.entries.map((e: any) => ({ ...e, selected: true })));
      setShowImport(true);
    } catch (err) {
      console.error('Screenshot parse error:', err);
      toast.error('Failed to parse screenshot');
    }
    setImporting(false);
  };

  const handleConfirmImport = async () => {
    const selected = parsedEntries.filter(e => e.selected);
    if (!selected.length) { toast.error('Select at least one entry'); return; }

    setImporting(true);
    // Batch insert all selected entries at once
    const rows = selected.map(entry => ({
      app_name: entry.appName,
      duration_seconds: entry.durationSeconds,
      usage_date: importDate,
      source: 'manual' as const,
      notes: entry.time ? `Imported from screenshot (${entry.time})` : 'Imported from screenshot',
    }));

    const { error } = await supabase.from('app_usage_logs').insert(rows);
    if (!error) await loadLogs();
    const added = error ? 0 : rows.length;
    toast.success(`Imported ${added} entries`);
    setShowImport(false);
    setParsedEntries([]);
    setImporting(false);
  };

  const totalDailySeconds = dailySummary.reduce((sum, a) => sum + a.totalSeconds, 0);
  const appsOverLimit = dailySummary.filter(a => 
    a.dailyLimitMinutes && (a.totalSeconds / 60) >= a.dailyLimitMinutes
  ).length;

  return (
    <div className="space-y-5">
      <Tabs defaultValue="daily">
        <TabsList className="w-full grid grid-cols-4 h-11">
          <TabsTrigger value="daily" className="text-xs sm:text-sm gap-1.5">
            <Clock className="h-3.5 w-3.5 hidden sm:block" />
            Daily
          </TabsTrigger>
          <TabsTrigger value="limits" className="text-xs sm:text-sm gap-1.5">
            <Target className="h-3.5 w-3.5 hidden sm:block" />
            Limits
          </TabsTrigger>
          <TabsTrigger value="monthly" className="text-xs sm:text-sm gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 hidden sm:block" />
            Monthly
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs sm:text-sm gap-1.5">
            <Zap className="h-3.5 w-3.5 hidden sm:block" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* ===== DAILY ===== */}
        <TabsContent value="daily" className="mt-5 space-y-4">
          {/* Date + Add button */}
          <div className="flex items-center justify-between gap-3">
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-auto text-sm"
            />
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const files = e.target.files;
                  if (files?.length) {
                    setImportDate(selectedDate);
                    handleMultipleScreenshots(Array.from(files));
                  }
                  e.target.value = '';
                }}
              />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing} className="gap-1.5">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Import
              </Button>
              <Button size="sm" onClick={() => setShowAddLog(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Log
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          {dailySummary.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Total Screen Time</p>
                  <p className="text-xl font-bold text-primary mt-0.5">{fmtDur(totalDailySeconds)}</p>
                </CardContent>
              </Card>
              <Card className={appsOverLimit > 0 ? 'bg-destructive/5 border-destructive/20' : 'bg-accent border-accent'}>
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-muted-foreground">Over Limit</p>
                  <p className={`text-xl font-bold mt-0.5 ${appsOverLimit > 0 ? 'text-destructive' : 'text-foreground'}`}>
                    {appsOverLimit} {appsOverLimit === 1 ? 'app' : 'apps'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* App Usage Cards */}
          {dailySummary.length > 0 ? (
            <div className="space-y-3">
              {dailySummary.map((app, i) => {
                const dailyPct = app.dailyLimitMinutes
                  ? Math.min(100, Math.round((app.totalSeconds / 60 / app.dailyLimitMinutes) * 100))
                  : null;
                const monthlyPct = app.monthlyLimitMinutes
                  ? Math.min(100, Math.round((app.monthlyTotalSeconds / 60 / app.monthlyLimitMinutes) * 100))
                  : null;
                const overDaily = dailyPct !== null && dailyPct >= 100;
                const overMonthly = monthlyPct !== null && monthlyPct >= 100;

                return (
                  <Card key={app.appName} className={`transition-all ${overDaily ? 'border-destructive/50 bg-destructive/5' : 'hover:shadow-md'}`}>
                    <CardContent className="py-3.5 px-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: COLORS[i % COLORS.length], color: 'white' }}
                          >
                            {app.appName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-sm">{app.appName}</span>
                            {overDaily && (
                              <div className="flex items-center gap-1 text-xs text-destructive">
                                <AlertTriangle className="h-3 w-3" />
                                Over limit
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-base font-bold tabular-nums">{fmtDur(app.totalSeconds)}</span>
                      </div>

                      {dailyPct !== null && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Daily: {Math.round(app.totalSeconds / 60)}m / {app.dailyLimitMinutes}m</span>
                            <span className={overDaily ? 'text-destructive font-semibold' : 'font-medium'}>{dailyPct}%</span>
                          </div>
                          <Progress value={dailyPct} className={`h-2 ${overDaily ? '[&>div]:bg-destructive' : ''}`} />
                        </div>
                      )}

                      {monthlyPct !== null && (
                        <div className="mt-2.5">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Monthly: {fmtDur(app.monthlyTotalSeconds)} / {Math.round(app.monthlyLimitMinutes! / 60)}h</span>
                            <span className={overMonthly ? 'text-destructive font-semibold' : 'font-medium'}>{monthlyPct}%</span>
                          </div>
                          <Progress value={monthlyPct} className={`h-2 ${overMonthly ? '[&>div]:bg-destructive' : ''}`} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground">No app usage logged</p>
                <p className="text-sm text-muted-foreground mt-1">Start tracking by logging your app usage</p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowAddLog(true)}>
                  <Plus className="h-4 w-4" /> Log Usage
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Pie Chart */}
          {dailySummary.length > 0 && dailySummary.some(a => a.totalSeconds > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Time Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="h-44 w-44 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dailySummary.filter(a => a.totalSeconds > 0)}
                          dataKey="totalSeconds"
                          nameKey="appName"
                          cx="50%" cy="50%"
                          outerRadius={70} innerRadius={40}
                          paddingAngle={3}
                          strokeWidth={0}
                        >
                          {dailySummary.filter(a => a.totalSeconds > 0).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [fmtDur(v), '']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-2 min-w-0">
                    {dailySummary.filter(a => a.totalSeconds > 0).map((app, i) => (
                      <div key={app.appName} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="truncate font-medium">{app.appName}</span>
                        <span className="text-muted-foreground ml-auto whitespace-nowrap">{fmtDur(app.totalSeconds)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grouped Activity Log */}
          {(() => {
            const dayLogs = logs.filter(l => l.usageDate === selectedDate);
            if (dayLogs.length === 0) return null;
            
            // Group by app name
            const grouped = new Map<string, typeof dayLogs>();
            dayLogs.forEach(log => {
              const existing = grouped.get(log.appName) || [];
              existing.push(log);
              grouped.set(log.appName, existing);
            });

            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Activity Log
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {Array.from(grouped.entries()).map(([appName, appLogs]) => {
                    const totalSecs = appLogs.reduce((s, l) => s + l.durationSeconds, 0);
                    const colorIdx = allAppNames.indexOf(appName) % COLORS.length;
                    
                    if (appLogs.length === 1) {
                      const log = appLogs[0];
                      return (
                        <div key={log.id} className="flex items-center justify-between text-sm py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[colorIdx] }} />
                            <div>
                              <span className="font-medium">{log.appName}</span>
                              <span className="text-muted-foreground ml-2">{fmtDur(log.durationSeconds)}</span>
                              {log.source === 'manual' && <span className="text-xs bg-muted px-1.5 py-0.5 rounded ml-1.5">manual</span>}
                              {log.notes && <p className="text-xs text-muted-foreground mt-0.5">{log.notes}</p>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteLog(log.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    }

                    return (
                      <CollapsibleAppGroup
                        key={appName}
                        appName={appName}
                        logs={appLogs}
                        totalSeconds={totalSecs}
                        color={COLORS[colorIdx]}
                        onDeleteLog={deleteLog}
                      />
                    );
                  })}
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* ===== LIMITS ===== */}
        <TabsContent value="limits" className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">App Limits</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Set daily & monthly caps</p>
            </div>
            <Button size="sm" onClick={() => setShowAddLimit(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Limit
            </Button>
          </div>

          {limits.length > 0 ? (
            <div className="space-y-3">
              {limits.map((lim, i) => (
                <Card key={lim.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-3.5 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: COLORS[i % COLORS.length], color: 'white' }}
                      >
                        {lim.appName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{lim.appName}</p>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                          {lim.dailyLimitMinutes && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {lim.dailyLimitMinutes}m/day
                            </span>
                          )}
                          {lim.monthlyLimitMinutes && (
                            <span className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" /> {Math.round(lim.monthlyLimitMinutes / 60)}h/mo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => deleteLimit(lim.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Target className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground">No limits set</p>
                <p className="text-sm text-muted-foreground mt-1">Set daily & monthly limits for apps like Instagram, YouTube</p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowAddLimit(true)}>
                  <Plus className="h-4 w-4" /> Add Limit
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== MONTHLY ===== */}
        <TabsContent value="monthly" className="mt-5 space-y-4">
          {monthlyStats.some(m => m.totalSeconds > 0) ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" /> Monthly Overview — {new Date().getFullYear()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyStats}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                        <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={v => `${Math.round(v / 3600)}h`} />
                        <Tooltip formatter={(v: number) => [fmtDur(v), 'Total']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                        <Bar dataKey="totalSeconds" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {monthlyStats.filter(m => m.totalSeconds > 0).map((m) => (
                <Card key={m.month} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">{m.month}</CardTitle>
                      <span className="text-sm font-bold text-primary">{fmtDur(m.totalSeconds)}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {m.apps.slice(0, 8).map((app, i) => {
                        const pct = m.totalSeconds > 0 ? Math.round((app.totalSeconds / m.totalSeconds) * 100) : 0;
                        return (
                          <div key={app.appName} className="flex items-center gap-3 text-xs">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="font-medium flex-1 truncate">{app.appName}</span>
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                            </div>
                            <span className="text-muted-foreground tabular-nums w-12 text-right">{fmtDur(app.totalSeconds)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground">No monthly data yet</p>
                <p className="text-sm text-muted-foreground mt-1">Start logging app usage to see trends</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== SETTINGS ===== */}
        <TabsContent value="settings" className="mt-5">
          <WhitelistApps />
        </TabsContent>
      </Tabs>

      {/* Add Log Dialog */}
      <Dialog open={showAddLog} onOpenChange={setShowAddLog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log App Usage</DialogTitle>
            <DialogDescription>Manually record time spent on an app</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>App Name</Label>
              <Input
                placeholder="e.g. Instagram"
                value={logForm.appName}
                onChange={e => setLogForm(f => ({ ...f, appName: e.target.value }))}
                list="app-names"
                className="mt-1.5"
              />
              <datalist id="app-names">
                {allAppNames.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Hours</Label>
                <Input type="number" min="0" placeholder="0" value={logForm.hours} onChange={e => setLogForm(f => ({ ...f, hours: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label>Minutes</Label>
                <Input type="number" min="0" max="59" placeholder="30" value={logForm.minutes} onChange={e => setLogForm(f => ({ ...f, minutes: e.target.value }))} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={logForm.date} onChange={e => setLogForm(f => ({ ...f, date: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input placeholder="e.g. reels scrolling" value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLog(false)}>Cancel</Button>
            <Button onClick={handleAddLog}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Limit Dialog */}
      <Dialog open={showAddLimit} onOpenChange={setShowAddLimit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set App Limit</DialogTitle>
            <DialogDescription>Set daily and/or monthly usage limits</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>App Name</Label>
              <Input
                placeholder="e.g. Instagram"
                value={limitForm.appName}
                onChange={e => setLimitForm(f => ({ ...f, appName: e.target.value }))}
                list="app-names-limit"
                className="mt-1.5"
              />
              <datalist id="app-names-limit">
                {allAppNames.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <Label>Daily Limit (minutes)</Label>
              <Input type="number" min="1" placeholder="30" value={limitForm.dailyMinutes} onChange={e => setLimitForm(f => ({ ...f, dailyMinutes: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label>Monthly Limit (hours)</Label>
              <Input type="number" min="1" placeholder="6" value={limitForm.monthlyHours} onChange={e => setLimitForm(f => ({ ...f, monthlyHours: e.target.value }))} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLimit(false)}>Cancel</Button>
            <Button onClick={handleAddLimit}>Save Limit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Screenshot Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Import from Screenshot
            </DialogTitle>
            <DialogDescription>
              {parsedEntries.length} entries found for {importDate}. Deselect any you don't want.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-1 pr-3">
              {parsedEntries.map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer transition-colors ${
                    entry.selected ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30 opacity-50'
                  }`}
                  onClick={() => {
                    setParsedEntries(prev =>
                      prev.map((e, j) => j === i ? { ...e, selected: !e.selected } : e)
                    );
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      entry.selected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                    }`}>
                      {entry.selected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div>
                      <span className="font-medium text-sm">{entry.appName}</span>
                      {entry.time ? <span className="text-xs text-muted-foreground ml-2">{entry.time}</span> : <span className="text-xs text-muted-foreground ml-2">time not shown</span>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-primary">
                    {fmtDur(entry.durationSeconds)}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setParsedEntries([]); }}>Cancel</Button>
            <Button onClick={handleConfirmImport} disabled={importing || !parsedEntries.some(e => e.selected)}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Import {parsedEntries.filter(e => e.selected).length} entries
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
