import React, { useState, useRef, useCallback } from 'react';
import { Camera, ArrowRight, Loader2, Smartphone, Trash2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface SnapshotEntry {
  appName: string;
  durationSeconds: number;
}

export interface ScreentimeDiff {
  appName: string;
  beforeSeconds: number;
  afterSeconds: number;
  diffSeconds: number;
}

export interface SnapshotSession {
  id: string;
  sessionLabel: string;
  startTime: string;
  endTime: string;
  beforeSnapshot: SnapshotEntry[];
  afterSnapshot: SnapshotEntry[];
  diffs: ScreentimeDiff[];
  totalDistractionSeconds: number;
}

interface ScreentimeSnapshotProps {
  onSessionCaptured: (session: SnapshotSession) => void;
  currentActivity?: string;
}

const STORAGE_KEY = 'screentime-pending-snapshot';

interface PendingSnapshot {
  entries: SnapshotEntry[];
  capturedAt: string;
  sessionLabel: string;
}

function fmtDur(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

async function parseScreenshot(file: File, date: string): Promise<SnapshotEntry[]> {
  const base64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

  const { data, error } = await supabase.functions.invoke('parse-app-usage-screenshot', {
    body: { imageBase64: base64, date },
  });

  if (error) throw new Error(error.message || 'Failed to parse screenshot');
  if (data?.error) throw new Error(data.error);

  return (data.entries || []).map((e: any) => ({
    appName: e.appName,
    durationSeconds: e.durationSeconds || 0,
  }));
}

function calculateDiffs(before: SnapshotEntry[], after: SnapshotEntry[]): ScreentimeDiff[] {
  const beforeMap = new Map<string, number>();
  before.forEach(e => {
    const key = e.appName.toLowerCase();
    beforeMap.set(key, (beforeMap.get(key) || 0) + e.durationSeconds);
  });

  const afterMap = new Map<string, number>();
  after.forEach(e => {
    const key = e.appName.toLowerCase();
    afterMap.set(key, (afterMap.get(key) || 0) + e.durationSeconds);
  });

  const diffs: ScreentimeDiff[] = [];
  const allApps = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  allApps.forEach(key => {
    const beforeSec = beforeMap.get(key) || 0;
    const afterSec = afterMap.get(key) || 0;
    const diff = afterSec - beforeSec;
    if (diff > 0) {
      // Use the original casing from the after snapshot
      const originalName = after.find(e => e.appName.toLowerCase() === key)?.appName
        || before.find(e => e.appName.toLowerCase() === key)?.appName
        || key;
      diffs.push({ appName: originalName, beforeSeconds: beforeSec, afterSeconds: afterSec, diffSeconds: diff });
    }
  });

  return diffs.sort((a, b) => b.diffSeconds - a.diffSeconds);
}

export const ScreentimeSnapshot: React.FC<ScreentimeSnapshotProps> = ({
  onSessionCaptured,
  currentActivity,
}) => {
  const [pending, setPending] = useState<PendingSnapshot | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const afterFileRef = useRef<HTMLInputElement>(null);

  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  const handleBeforeCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setParsing(true);
    try {
      const entries = await parseScreenshot(file, today);
      if (entries.length === 0) {
        toast.error('No app usage found in screenshot');
        return;
      }

      const snapshot: PendingSnapshot = {
        entries,
        capturedAt: new Date().toISOString(),
        sessionLabel: currentActivity || 'Work Session',
      };
      setPending(snapshot);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      toast.success(`Before snapshot captured: ${entries.length} apps`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse screenshot');
    } finally {
      setParsing(false);
    }
  }, [today, currentActivity]);

  const handleAfterCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pending) return;
    e.target.value = '';

    setParsing(true);
    try {
      const afterEntries = await parseScreenshot(file, today);
      if (afterEntries.length === 0) {
        toast.error('No app usage found in screenshot');
        return;
      }

      const diffs = calculateDiffs(pending.entries, afterEntries);
      const totalDistraction = diffs.reduce((s, d) => s + d.diffSeconds, 0);

      const session: SnapshotSession = {
        id: Math.random().toString(36).substring(2, 15),
        sessionLabel: pending.sessionLabel,
        startTime: pending.capturedAt,
        endTime: new Date().toISOString(),
        beforeSnapshot: pending.entries,
        afterSnapshot: afterEntries,
        diffs,
        totalDistractionSeconds: totalDistraction,
      };

      onSessionCaptured(session);

      // Clear pending
      setPending(null);
      localStorage.removeItem(STORAGE_KEY);

      if (totalDistraction > 0) {
        toast.success(`Session captured: ${fmtDur(totalDistraction)} screen time during session`);
      } else {
        toast.success('Session captured: No extra screen time detected! 🎯');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse screenshot');
    } finally {
      setParsing(false);
    }
  }, [pending, today, onSessionCaptured]);

  const clearPending = () => {
    setPending(null);
    localStorage.removeItem(STORAGE_KEY);
    toast.info('Pending snapshot cleared');
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          Screentime Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBeforeCapture} />
        <input ref={afterFileRef} type="file" accept="image/*" className="hidden" onChange={handleAfterCapture} />

        {!pending ? (
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Upload a digital wellbeing screenshot before starting work
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="gap-1.5"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Before Snapshot
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Before: {pending.entries.length} apps captured</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(pending.capturedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}{pending.sessionLabel}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearPending}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center justify-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">
                Upload after your work session ends
              </p>
              <Button
                size="sm"
                onClick={() => afterFileRef.current?.click()}
                disabled={parsing}
                className="gap-1.5"
              >
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                After Snapshot
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
