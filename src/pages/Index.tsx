import React, { useState, useEffect, useCallback } from 'react';
import { Moon, Sun, Download, Upload, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Bell, BellOff, MoreVertical } from 'lucide-react';
import { getCategoryCorrections } from '@/hooks/useActivities';
import { format, addDays, subDays } from 'date-fns';
import { useActivities } from '@/hooks/useActivities';
import { useAppUsageMonitor } from '@/hooks/useAppUsageMonitor';
import { usePersistentNotification } from '@/hooks/usePersistentNotification';
import { ActivityInput } from '@/components/ActivityInput';
import { DailyInsights } from '@/components/DailyInsights';
import { GapDetectionDialog } from '@/components/GapDetectionDialog';
import { ManualActivityInput } from '@/components/ManualActivityInput';
import { SleepLogger } from '@/components/SleepLogger';
import { DistractionPrompt } from '@/components/DistractionPrompt';
import { ScreentimeSnapshot, SnapshotSession } from '@/components/ScreentimeSnapshot';
import { SessionIntegrity } from '@/components/SessionIntegrity';

import { WeeklyAnalysis } from '@/components/WeeklyAnalysis';
import { MonthlyAnalysis } from '@/components/MonthlyAnalysis';

import { InsightsPage } from '@/components/InsightsPage';
import { AppSessionAnalysis } from '@/components/AppSessionAnalysis';
import { YearlyStats } from '@/components/YearlyStats';
import { SleepAnalysis } from '@/components/SleepAnalysis';

import { WhitelistApps } from '@/components/WhitelistApps';
import { AppUsagePage } from '@/components/AppUsagePage';
import { UnifiedDayView } from '@/components/UnifiedDayView';
import { useAppUsage } from '@/hooks/useAppUsage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { ParsedActivity, ActivityCategory, Activity, getCustomCategories } from '@/types/activity';
import { cn } from '@/lib/utils';

const Index = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme-dark');
      if (saved !== null) {
        const dark = saved === 'true';
        document.documentElement.classList.toggle('dark', dark);
        return dark;
      }
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [pendingGap, setPendingGap] = useState<{
    startTime: string;
    endTime: string;
    durationMinutes: number;
  } | null>(null);
  const [showGapDialog, setShowGapDialog] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [snapshotSessions, setSnapshotSessions] = useState<SnapshotSession[]>(() => {
    try {
      const stored = localStorage.getItem('screentime-sessions');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const handleSnapshotSession = (session: SnapshotSession) => {
    setSnapshotSessions(prev => {
      const updated = [...prev, session];
      localStorage.setItem('screentime-sessions', JSON.stringify(updated));
      return updated;
    });
  };

  // Filter snapshot sessions for selected date
  const todaySnapshots = snapshotSessions.filter(s => {
    const endDate = new Date(s.endTime);
    const key = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return key === (selectedDate || today);
  });

  const {
    activities,
    allData,
    ongoingActivity,
    addActivity,
    stopOngoingActivity,
    deleteActivity,
    updateActivity,
    exportData,
    importData,
    clearAllData,
    datesWithData,
    today,
  } = useActivities(selectedDate);

  const { logs: appUsageLogs } = useAppUsage();

  const {
    pendingDistraction,
    distractionHistory,
    respondToDistraction,
  } = useAppUsageMonitor(ongoingActivity?.description);

  const handleNotificationReply = useCallback(async (text: string) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('parse-activity', {
        body: { message: text, hasOngoingActivity: !!ongoingActivity, categoryCorrections: getCategoryCorrections().slice(-20), customCategories: getCustomCategories() },
      });
      if (!error && data && !data.error) {
        handleActivityParsed(data);
      }
    } catch (err) {
      console.error('Error processing notification reply:', err);
    }
  }, [ongoingActivity]);

  const {
    isNative: isNativePlatform,
    isActive: isNotificationActive,
    startNotification,
    stopNotification,
  } = usePersistentNotification({
    onReply: handleNotificationReply,
    currentActivity: ongoingActivity?.description,
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme-dark', String(isDark));
  }, [isDark]);

  const checkForGap = (newStartTime: string): { startTime: string; endTime: string; durationMinutes: number } | null => {
    const completedActivities = activities.filter(a => !a.isOngoing && a.endTime);
    if (completedActivities.length === 0) return null;
    const sorted = [...completedActivities].sort((a, b) =>
      new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime()
    );
    const lastActivity = sorted[0];
    const lastEndTime = new Date(lastActivity.endTime!).getTime();
    const newStart = new Date(newStartTime).getTime();
    const gapMinutes = Math.round((newStart - lastEndTime) / (1000 * 60));
    if (gapMinutes > 5) {
      return { startTime: lastActivity.endTime!, endTime: newStartTime, durationMinutes: gapMinutes };
    }
    return null;
  };

  const handleActivityParsed = (parsed: ParsedActivity) => {
    if (parsed.intent === 'stop') {
      stopOngoingActivity(parsed.startTime);
    } else {
      const startTime = parsed.startTime || new Date().toISOString();
      const gap = checkForGap(startTime);
      if (gap) { setPendingGap(gap); setShowGapDialog(true); }
      addActivity({
        description: parsed.description,
        category: parsed.category,
        startTime,
        isOngoing: parsed.intent === 'start' || parsed.intent === 'switch',
      });
    }
  };

  const handleManualActivity = (activity: {
    description: string;
    category: ActivityCategory;
    startTime: string;
    endTime?: string;
    isOngoing: boolean;
  }) => {
    const gap = checkForGap(activity.startTime);
    if (gap) { setPendingGap(gap); setShowGapDialog(true); }
    addActivity({
      description: activity.description,
      category: activity.category,
      startTime: activity.startTime,
      endTime: activity.endTime,
      duration: activity.endTime
        ? Math.round((new Date(activity.endTime).getTime() - new Date(activity.startTime).getTime()) / (1000 * 60))
        : undefined,
      isOngoing: activity.isOngoing,
    });
    toast.success(`Added: ${activity.description}`);
  };

  const handleFillGap = (description: string, category: ActivityCategory) => {
    if (!pendingGap) return;
    addActivity({
      description,
      category,
      startTime: pendingGap.startTime,
      endTime: pendingGap.endTime,
      duration: pendingGap.durationMinutes,
      isOngoing: false,
    });
    setPendingGap(null);
    setShowGapDialog(false);
    toast.success(`Gap filled: ${description}`);
  };

  const handleSkipGap = () => { setPendingGap(null); setShowGapDialog(false); };

  const handleDistractionRespond = (isWorkRelated: boolean, reason?: string) => {
    respondToDistraction(isWorkRelated);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const success = importData(text);
      if (success) { toast.success('Data imported successfully!'); }
      else { toast.error('Failed to import data.'); }
    };
    input.click();
  };

  const handleClearAll = () => { clearAllData(); setShowClearDialog(false); toast.success('All data cleared'); };

  const navigateDate = (direction: 'prev' | 'next') => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const current = new Date(year, month - 1, day);
    const newDate = direction === 'prev' ? subDays(current, 1) : addDays(current, 1);
    const newDateStr = format(newDate, 'yyyy-MM-dd');
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    if (direction === 'next' && newDateStr > todayStr) return;
    setSelectedDate(newDateStr);
  };

  const isViewingToday = selectedDate === today;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">Time Tracker</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">AI-powered personal activity tracking</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isNativePlatform && (
                <Button variant="ghost" size="icon" className="h-11 w-11 min-w-[44px] min-h-[44px]" onClick={isNotificationActive ? stopNotification : startNotification}>
                  {isNotificationActive ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11 min-w-[44px] min-h-[44px]">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportData}>
                    <Download className="h-4 w-4 mr-2" /> Export Data
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleImport}>
                    <Upload className="h-4 w-4 mr-2" /> Import Data
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowClearDialog(true)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Clear All Data
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsDark(!isDark)}>
                    {isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Main Tabs */}
        <Tabs defaultValue="today" className="space-y-4 sm:space-y-6">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="today" className="min-h-[44px]">Today</TabsTrigger>
            <TabsTrigger value="analysis" className="min-h-[44px]">Analysis</TabsTrigger>
            <TabsTrigger value="apps" className="min-h-[44px]">Apps</TabsTrigger>
          </TabsList>

          {/* ===== TODAY TAB ===== */}
          <TabsContent value="today" className="space-y-6">
            {/* Date Navigation */}
            <div className="flex items-center justify-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigateDate('prev')}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2 min-w-[200px]">
                    <CalendarIcon className="h-4 w-4" />
                    {isViewingToday ? 'Today' : (() => {
                      const [year, month, day] = selectedDate.split('-').map(Number);
                      return format(new Date(year, month - 1, day), 'EEEE, MMM d');
                    })()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={(() => {
                      const [year, month, day] = selectedDate.split('-').map(Number);
                      return new Date(year, month - 1, day);
                    })()}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
                      }
                    }}
                    modifiers={{ hasData: datesWithData.map(d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); }) }}
                    modifiersStyles={{ hasData: { fontWeight: 'bold', textDecoration: 'underline' } }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" onClick={() => navigateDate('next')} disabled={isViewingToday}>
                <ChevronRight className="h-5 w-5" />
              </Button>
              {!isViewingToday && (
                <Button variant="secondary" size="sm" onClick={() => {
                  const now = new Date();
                  setSelectedDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
                }}>Go to Today</Button>
              )}
            </div>

            {/* Activity Input */}
            {isViewingToday && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">What are you doing?</CardTitle>
                  <div className="flex gap-2">
                    <SleepLogger onAddSleep={(sleep) => {
                      addActivity({
                        description: sleep.description,
                        category: sleep.category,
                        startTime: sleep.startTime,
                        endTime: sleep.endTime,
                        duration: Math.round((new Date(sleep.endTime).getTime() - new Date(sleep.startTime).getTime()) / 60000),
                        isOngoing: false,
                      });
                    }} />
                    <ManualActivityInput onAddActivity={handleManualActivity} />
                  </div>
                </CardHeader>
                <CardContent>
                  <ActivityInput onActivityParsed={handleActivityParsed} hasOngoingActivity={!!ongoingActivity} ongoingActivity={ongoingActivity} />
                </CardContent>
              </Card>
            )}

            <GapDetectionDialog open={showGapDialog} onOpenChange={setShowGapDialog} gap={pendingGap} onFillGap={handleFillGap} onSkip={handleSkipGap} />
            <DistractionPrompt distraction={pendingDistraction} onRespond={handleDistractionRespond} />

            {/* Screentime Snapshot */}
            {isViewingToday && (
              <ScreentimeSnapshot
                onSessionCaptured={handleSnapshotSession}
                currentActivity={ongoingActivity?.description}
              />
            )}

            {/* Unified Day View */}
            <UnifiedDayView activities={activities} appLogs={appUsageLogs} selectedDate={selectedDate} onDeleteActivity={deleteActivity} onUpdateActivity={updateActivity} snapshotSessions={todaySnapshots} />

            {/* Session Integrity */}
            <SessionIntegrity
              activities={activities}
              distractionHistory={distractionHistory}
              snapshotSessions={todaySnapshots}
            />

            <div className="grid gap-4 sm:gap-6 grid-cols-1">
              <DailyInsights activities={activities} date={selectedDate} />
            </div>
          </TabsContent>

          {/* ===== ANALYSIS TAB ===== */}
          <TabsContent value="analysis" className="space-y-6">
            <Tabs defaultValue="overview">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="sleep">Sleep</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <InsightsPage allData={allData} distractionHistory={distractionHistory} />
              </TabsContent>

              <TabsContent value="sleep" className="mt-4">
                <SleepAnalysis allData={allData} />
              </TabsContent>

              <TabsContent value="weekly" className="space-y-4 mt-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>← Prev</Button>
                  <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>Current</Button>
                  <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => Math.max(0, w - 1))} disabled={weekOffset === 0}>Next →</Button>
                </div>
                <WeeklyAnalysis allData={allData} distractionHistory={distractionHistory} weekOffset={weekOffset} />
              </TabsContent>

              <TabsContent value="monthly" className="space-y-4 mt-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setMonthOffset(m => m + 1)}>← Prev</Button>
                  <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)} disabled={monthOffset === 0}>Current</Button>
                  <Button variant="outline" size="sm" onClick={() => setMonthOffset(m => Math.max(0, m - 1))} disabled={monthOffset === 0}>Next →</Button>
                </div>
                <MonthlyAnalysis allData={allData} distractionHistory={distractionHistory} monthOffset={monthOffset} />
              </TabsContent>

              <TabsContent value="yearly" className="space-y-4 mt-4">
                <YearlyStats allData={allData} distractionHistory={distractionHistory} />
                <AppSessionAnalysis />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ===== APPS TAB ===== */}
          <TabsContent value="apps">
            <AppUsagePage />
          </TabsContent>
        </Tabs>

        <div className="text-center py-6 border-t mt-6">
          <p className="text-sm text-muted-foreground">
            🔒 All your data is stored locally in your browser. Nothing is sent to any server except for AI analysis.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Index;
