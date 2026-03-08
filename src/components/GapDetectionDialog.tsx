import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategorySelect } from './CategorySelect';
import { ActivityCategory } from '@/types/activity';

interface GapInfo {
  startTime: string; // ISO string
  endTime: string; // ISO string
  durationMinutes: number;
}

interface GapDetectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gap: GapInfo | null;
  onFillGap: (description: string, category: ActivityCategory) => void;
  onSkip: () => void;
}

const formatTime = (isoString: string): string => {
  try {
    return format(parseISO(isoString), 'HH:mm');
  } catch {
    return isoString;
  }
};

const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

export const GapDetectionDialog: React.FC<GapDetectionDialogProps> = ({
  open,
  onOpenChange,
  gap,
  onFillGap,
  onSkip,
}) => {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('other');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    onFillGap(description.trim(), category);
    setDescription('');
    setCategory('other');
  };

  const handleSkip = () => {
    onSkip();
    setDescription('');
    setCategory('other');
  };

  if (!gap) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Time Gap Detected
          </DialogTitle>
          <DialogDescription>
            There's a gap in your activity log. What were you doing?
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3 py-4 px-3 bg-muted/50 rounded-lg">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">
              {formatTime(gap.startTime)} — {formatTime(gap.endTime)}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDuration(gap.durationMinutes)} unaccounted
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gap-description">What were you doing?</Label>
            <Input
              id="gap-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Taking a break, on a call..."
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gap-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ActivityCategory)}>
              <SelectTrigger id="gap-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Skip
            </Button>
            <Button type="submit" disabled={!description.trim()}>
              Add Activity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
