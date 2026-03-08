import React, { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Clock } from 'lucide-react';
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
import { CategorySelect } from './CategorySelect';
import { ActivityCategory } from '@/types/activity';

interface ManualActivityInputProps {
  onAddActivity: (activity: {
    description: string;
    category: ActivityCategory;
    startTime: string;
    endTime?: string;
    isOngoing: boolean;
  }) => void;
}

const getCurrentTimeString = (): string => {
  return format(new Date(), 'HH:mm');
};

const timeStringToISO = (timeStr: string, dateStr: string): string => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  return date.toISOString();
};

export const ManualActivityInput: React.FC<ManualActivityInputProps> = ({
  onAddActivity,
}) => {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('other');
  const [startTime, setStartTime] = useState(getCurrentTimeString());
  const [endTime, setEndTime] = useState('');
  const [isOngoing, setIsOngoing] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');

  const resetForm = () => {
    setDescription('');
    setCategory('other');
    setStartTime(getCurrentTimeString());
    setEndTime('');
    setIsOngoing(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !startTime) return;

    const startISO = timeStringToISO(startTime, today);
    const endISO = !isOngoing && endTime ? timeStringToISO(endTime, today) : undefined;

    onAddActivity({
      description: description.trim(),
      category,
      startTime: startISO,
      endTime: endISO,
      isOngoing: isOngoing,
    });

    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Manual Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Add Activity Manually
          </DialogTitle>
          <DialogDescription>
            Enter the activity details with specific times
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-description">Activity Description</Label>
            <Input
              id="manual-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Team meeting, Lunch break..."
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ActivityCategory)}>
              <SelectTrigger id="manual-category">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manual-start-time">Start Time</Label>
              <Input
                id="manual-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-end-time">
                End Time {isOngoing && <span className="text-muted-foreground">(optional)</span>}
              </Label>
              <Input
                id="manual-end-time"
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  if (e.target.value) setIsOngoing(false);
                }}
                placeholder="Leave empty if ongoing"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="manual-ongoing"
              checked={isOngoing}
              onChange={(e) => {
                setIsOngoing(e.target.checked);
                if (e.target.checked) setEndTime('');
              }}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="manual-ongoing" className="text-sm font-normal cursor-pointer">
              Activity is still ongoing
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!description.trim() || !startTime}>
              Add Activity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
