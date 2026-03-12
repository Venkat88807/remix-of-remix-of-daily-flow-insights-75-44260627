import React, { useState } from 'react';
import { Moon } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface SleepLoggerProps {
  onAddSleep: (activity: {
    description: string;
    category: 'sleep';
    startTime: string;
    endTime: string;
    isOngoing: false;
  }) => void;
}

const getDefaultBedtime = (): { date: string; time: string } => {
  const yesterday = subDays(new Date(), 1);
  return {
    date: format(yesterday, 'yyyy-MM-dd'),
    time: '23:00',
  };
};

const getDefaultWakeTime = (): { date: string; time: string } => {
  return {
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '07:00',
  };
};

export const SleepLogger: React.FC<SleepLoggerProps> = ({ onAddSleep }) => {
  const [open, setOpen] = useState(false);
  const [bedDate, setBedDate] = useState(() => getDefaultBedtime().date);
  const [bedTime, setBedTime] = useState(() => getDefaultBedtime().time);
  const [wakeDate, setWakeDate] = useState(() => getDefaultWakeTime().date);
  const [wakeTime, setWakeTime] = useState(() => getDefaultWakeTime().time);

  const resetForm = () => {
    const bed = getDefaultBedtime();
    const wake = getDefaultWakeTime();
    setBedDate(bed.date);
    setBedTime(bed.time);
    setWakeDate(wake.date);
    setWakeTime(wake.time);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedDate || !bedTime || !wakeDate || !wakeTime) return;

    const [by, bm, bd] = bedDate.split('-').map(Number);
    const [bh, bmin] = bedTime.split(':').map(Number);
    const bedDateTime = new Date(by, bm - 1, bd, bh, bmin, 0, 0);

    const [wy, wm, wd] = wakeDate.split('-').map(Number);
    const [wh, wmin] = wakeTime.split(':').map(Number);
    const wakeDateTime = new Date(wy, wm - 1, wd, wh, wmin, 0, 0);

    if (wakeDateTime <= bedDateTime) {
      toast.error('Wake time must be after bedtime');
      return;
    }

    const durationHrs = (wakeDateTime.getTime() - bedDateTime.getTime()) / (1000 * 60 * 60);
    if (durationHrs > 24) {
      toast.error('Sleep duration cannot exceed 24 hours');
      return;
    }

    onAddSleep({
      description: `Sleep (${format(bedDateTime, 'HH:mm')} — ${format(wakeDateTime, 'HH:mm')})`,
      category: 'sleep',
      startTime: bedDateTime.toISOString(),
      endTime: wakeDateTime.toISOString(),
      isOngoing: false,
    });

    toast.success(`Logged ${durationHrs.toFixed(1)}h of sleep`);
    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Moon className="h-4 w-4" />
          Log Sleep
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            Log Sleep
          </DialogTitle>
          <DialogDescription>
            Record your sleep — supports cross-midnight entries automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Bedtime</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="bed-date" className="text-xs text-muted-foreground">Date</Label>
                <Input
                  id="bed-date"
                  type="date"
                  value={bedDate}
                  onChange={(e) => setBedDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bed-time" className="text-xs text-muted-foreground">Time</Label>
                <Input
                  id="bed-time"
                  type="time"
                  value={bedTime}
                  onChange={(e) => setBedTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Wake Up</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="wake-date" className="text-xs text-muted-foreground">Date</Label>
                <Input
                  id="wake-date"
                  type="date"
                  value={wakeDate}
                  onChange={(e) => setWakeDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wake-time" className="text-xs text-muted-foreground">Time</Label>
                <Input
                  id="wake-time"
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          {bedDate && bedTime && wakeDate && wakeTime && (() => {
            const [by, bm, bd] = bedDate.split('-').map(Number);
            const [bh, bmin] = bedTime.split(':').map(Number);
            const bedDt = new Date(by, bm - 1, bd, bh, bmin);
            const [wy, wm, wd] = wakeDate.split('-').map(Number);
            const [wh, wmin] = wakeTime.split(':').map(Number);
            const wakeDt = new Date(wy, wm - 1, wd, wh, wmin);
            const durMs = wakeDt.getTime() - bedDt.getTime();
            if (durMs <= 0) return null;
            const hrs = durMs / (1000 * 60 * 60);
            const h = Math.floor(hrs);
            const m = Math.round((hrs - h) * 60);
            return (
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="text-2xl font-bold text-foreground">{h}h {m}m</p>
              </div>
            );
          })()}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!bedDate || !bedTime || !wakeDate || !wakeTime}>
              Log Sleep
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
