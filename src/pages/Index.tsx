import React, { useState, useEffect, useCallback } from 'react';
import { Moon, Sun, Download, Upload, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Bell, BellOff } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { useActivities } from '@/hooks/useActivities';
import { useAppUsageMonitor } from '@/hooks/useAppUsageMonitor';
import { usePersistentNotification } from '@/hooks/usePersistentNotification';
import { ActivityInput } from '@/components/ActivityInput';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { TimeCharts } from '@/components/TimeCharts';
import { DailyInsights } from '@/components/DailyInsights';
import { GapDetectionDialog } from '@/components/GapDetectionDialog';
import { ManualActivityInput } from '@/components/ManualActivityInput';
import { DistractionPrompt } from '@/components/DistractionPrompt';
import { AppSessionTimer } from '@/components/AppSessionTimer';
import { WeeklyAnalysis } from '@/components/WeeklyAnalysis';
import { MonthlyAnalysis } from '@/components/MonthlyAnalysis';
import { ProductivityHeatmap } from '@/components/ProductivityHeatmap';
import { AppSessionAnalysis } from '@/components/AppSessionAnalysis';
import { YearlyStats } from '@/components/YearlyStats';
import { SessionIntegrity } from '@/components/SessionIntegrity';
import { WhitelistApps } from '@/components/WhitelistApps';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ParsedActivity, ActivityCategory, Activity } from '@/types/activity';
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

  const {
    pendingDistraction,
    distractionHistory,
    respondToDistraction,
  } = useAppUsageMonitor(ongoingActivity?.description);

  const handleNotificationReply = useCallback(async (text: string) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('parse-activity', {
        body: { message: text, hasOngoingActivity: !!ongoingActivity },
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
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {isNativePlatform && (
                <Button variant="ghost" size="icon" className="h-10 w-10" onClick={isNotificationActive ? stopNotification : startNotification}>
                  {isNotificationActive ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={exportData}><Download className="h-5 w-5" /></Button>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleImport}><Upload className="h-5 w-5" /></Button>
              <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10"><Trash2 className="h-5 w-5" /></Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Clear All Data?</DialogTitle>
                    <DialogDescription>This will permanently delete all your tracked activities.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowClearDialog(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={handleClearAll}>Clear All</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setIsDark(!isDark)}>
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
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
                  <ManualActivityInput onAddActivity={handleManualActivity} />
                </CardHeader>
                <CardContent>
                  <ActivityInput onActivityParsed={handleActivityParsed} hasOngoingActivity={!!ongoingActivity} ongoingActivity={ongoingActivity} />
                </CardContent>
              </Card>
            )}

            <GapDetectionDialog open={showGapDialog} onOpenChange={setShowGapDialog} gap={pendingGap} onFillGap={handleFillGap} onSkip={handleSkipGap} />
            <DistractionPrompt distraction={pendingDistraction} onRespond={handleDistractionRespond} />

            <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
              <Card className="lg:row-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">
                    Activity Timeline
                    {activities.length > 0 && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">({activities.length})</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityTimeline activities={activities} onDelete={deleteActivity} onUpdate={updateActivity} distractionHistory={distractionHistory} />
                </CardContent>
              </Card>

              <TimeCharts activities={activities} />
              <AppSessionTimer selectedDate={selectedDate} isToday={isViewingToday} />
              <SessionIntegrity activities={activities} distractionHistory={distractionHistory} />
              <ProductivityHeatmap allData={allData} distractionHistory={distractionHistory} selectedDate={selectedDate} mode="daily" />
              <DailyInsights activities={activities} date={selectedDate} />
            </div>
          </TabsContent>

          {/* ===== ANALYSIS TAB ===== */}
          <TabsContent value="analysis" className="space-y-6">
            <Tabs defaultValue="weekly">
              <TabsList className="flex flex-wrap gap-1">
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly</TabsTrigger>
                <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
                <TabsTrigger value="logging">Logging Time</TabsTrigger>
              </TabsList>

              <TabsContent value="weekly" className="space-y-4 mt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>← Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>Current</Button>
                  <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => Math.max(0, w - 1))} disabled={weekOffset === 0}>Next →</Button>
                </div>
                <WeeklyAnalysis allData={allData} distractionHistory={distractionHistory} weekOffset={weekOffset} />
                <SessionIntegrity activities={activities} distractionHistory={distractionHistory} />
              </TabsContent>

              <TabsContent value="monthly" className="space-y-4 mt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => setMonthOffset(m => m + 1)}>← Previous</Button>
                  <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)} disabled={monthOffset === 0}>Current</Button>
                  <Button variant="outline" size="sm" onClick={() => setMonthOffset(m => Math.max(0, m - 1))} disabled={monthOffset === 0}>Next →</Button>
                </div>
                <MonthlyAnalysis allData={allData} distractionHistory={distractionHistory} monthOffset={monthOffset} />
              </TabsContent>

              <TabsContent value="yearly" className="space-y-4 mt-4">
                <YearlyStats allData={allData} distractionHistory={distractionHistory} />
              </TabsContent>

              <TabsContent value="heatmap" className="mt-4">
                <ProductivityHeatmap allData={allData} distractionHistory={distractionHistory} selectedDate={selectedDate} mode="weekly" />
              </TabsContent>

              <TabsContent value="logging" className="mt-4">
                <AppSessionAnalysis />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ===== APPS TAB ===== */}
          <TabsContent value="apps">
            <WhitelistApps />
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
