import React, { useState } from 'react';
import { format } from 'date-fns';
import { Smartphone, Plus, Target, BarChart3, Trash2, Clock } from 'lucide-react';
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

export const AppUsagePage: React.FC = () => {
  const {
    dailySummary, monthlyStats, allAppNames, limits,
    addManualLog, deleteLog, upsertLimit, deleteLimit,
    selectedDate, setSelectedDate, logs, loading,
  } = useAppUsage();

  const [showAddLog, setShowAddLog] = useState(false);
  const [showAddLimit, setShowAddLimit] = useState(false);
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

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="space-y-4">
      <Tabs defaultValue="daily">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="limits">Limits</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ===== DAILY ===== */}
        <TabsContent value="daily" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-auto"
            />
            <Button size="sm" variant="outline" onClick={() => setShowAddLog(true)}>
              <Plus className="h-4 w-4 mr-1" /> Log Usage
            </Button>
          </div>

          {/* Summary cards */}
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
                  <Card key={app.appName} className={overDaily ? 'border-destructive' : ''}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="font-medium text-sm">{app.appName}</span>
                        </div>
                        <span className="text-sm font-bold">{fmtDur(app.totalSeconds)}</span>
                      </div>

                      {dailyPct !== null && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Daily: {Math.round(app.totalSeconds / 60)}m / {app.dailyLimitMinutes}m</span>
                            <span className={overDaily ? 'text-destructive font-medium' : ''}>{dailyPct}%</span>
                          </div>
                          <Progress value={dailyPct} className={`h-1.5 ${overDaily ? '[&>div]:bg-destructive' : ''}`} />
                        </div>
                      )}

                      {monthlyPct !== null && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Monthly: {fmtDur(app.monthlyTotalSeconds)} / {Math.round(app.monthlyLimitMinutes! / 60)}h</span>
                            <span className={overMonthly ? 'text-destructive font-medium' : ''}>{monthlyPct}%</span>
                          </div>
                          <Progress value={monthlyPct} className={`h-1.5 ${overMonthly ? '[&>div]:bg-destructive' : ''}`} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Smartphone className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No app usage for this date</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddLog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Log Manually
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Daily pie chart */}
          {dailySummary.length > 0 && dailySummary.some(a => a.totalSeconds > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Time Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="h-40 w-40 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dailySummary.filter(a => a.totalSeconds > 0)}
                          dataKey="totalSeconds"
                          nameKey="appName"
                          cx="50%" cy="50%"
                          outerRadius={65} innerRadius={35}
                          paddingAngle={2}
                        >
                          {dailySummary.filter(a => a.totalSeconds > 0).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [fmtDur(v), '']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    {dailySummary.filter(a => a.totalSeconds > 0).map((app, i) => (
                      <div key={app.appName} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="truncate">{app.appName}</span>
                        <span className="text-muted-foreground ml-auto whitespace-nowrap">{fmtDur(app.totalSeconds)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent logs */}
          {logs.filter(l => l.usageDate === selectedDate).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Logs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {logs.filter(l => l.usageDate === selectedDate).map(log => (
                  <div key={log.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                    <div>
                      <span className="font-medium">{log.appName}</span>
                      <span className="text-muted-foreground ml-2">{fmtDur(log.durationSeconds)}</span>
                      {log.source === 'manual' && (
                        <span className="text-xs text-muted-foreground ml-1">(manual)</span>
                      )}
                      {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteLog(log.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== LIMITS ===== */}
        <TabsContent value="limits" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowAddLimit(true)}>
              <Target className="h-4 w-4 mr-1" /> Add Limit
            </Button>
          </div>

          {limits.length > 0 ? (
            <div className="space-y-3">
              {limits.map(lim => (
                <Card key={lim.id}>
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{lim.appName}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        {lim.dailyLimitMinutes && <span>Daily: {lim.dailyLimitMinutes}m</span>}
                        {lim.monthlyLimitMinutes && <span>Monthly: {Math.round(lim.monthlyLimitMinutes / 60)}h</span>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteLimit(lim.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground text-sm">No limits set</p>
                <p className="text-xs text-muted-foreground mt-1">Set daily/monthly limits for apps like Instagram, YouTube</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== MONTHLY ===== */}
        <TabsContent value="monthly" className="mt-4 space-y-4">
          {monthlyStats.some(m => m.totalSeconds > 0) ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Monthly Total — {new Date().getFullYear()}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyStats}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                        <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={v => `${Math.round(v / 3600)}h`} />
                        <Tooltip formatter={(v: number) => [fmtDur(v), 'Total']} contentStyle={{ fontSize: 11 }} />
                        <Bar dataKey="totalSeconds" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Per-month app breakdown */}
              {monthlyStats.filter(m => m.totalSeconds > 0).map((m, mi) => (
                <Card key={m.month}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{m.month} — {fmtDur(m.totalSeconds)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      {m.apps.slice(0, 8).map((app, i) => (
                        <div key={app.appName} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span>{app.appName}</span>
                          </div>
                          <span className="text-muted-foreground">{fmtDur(app.totalSeconds)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No monthly data yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== SETTINGS ===== */}
        <TabsContent value="settings" className="mt-4">
          <WhitelistApps />
        </TabsContent>
      </Tabs>

      {/* Add Log Dialog */}
      <Dialog open={showAddLog} onOpenChange={setShowAddLog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log App Usage</DialogTitle>
            <DialogDescription>Manually log time spent on an app</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>App Name</Label>
              <Input
                placeholder="e.g. Instagram"
                value={logForm.appName}
                onChange={e => setLogForm(f => ({ ...f, appName: e.target.value }))}
                list="app-names"
              />
              <datalist id="app-names">
                {allAppNames.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Hours</Label>
                <Input type="number" min="0" placeholder="0" value={logForm.hours} onChange={e => setLogForm(f => ({ ...f, hours: e.target.value }))} />
              </div>
              <div>
                <Label>Minutes</Label>
                <Input type="number" min="0" max="59" placeholder="30" value={logForm.minutes} onChange={e => setLogForm(f => ({ ...f, minutes: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={logForm.date} onChange={e => setLogForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input placeholder="e.g. reels scrolling" value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} />
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
              />
              <datalist id="app-names-limit">
                {allAppNames.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <Label>Daily Limit (minutes)</Label>
              <Input type="number" min="1" placeholder="30" value={limitForm.dailyMinutes} onChange={e => setLimitForm(f => ({ ...f, dailyMinutes: e.target.value }))} />
            </div>
            <div>
              <Label>Monthly Limit (hours)</Label>
              <Input type="number" min="1" placeholder="6" value={limitForm.monthlyHours} onChange={e => setLimitForm(f => ({ ...f, monthlyHours: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLimit(false)}>Cancel</Button>
            <Button onClick={handleAddLimit}>Save Limit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
