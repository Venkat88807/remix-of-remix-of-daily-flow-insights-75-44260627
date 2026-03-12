import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Activity, ActivityCategory } from '@/types/activity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategorySelect } from './CategorySelect';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

interface EditActivityDialogProps {
  activity: Activity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (activityId: string, updates: Partial<Activity>) => void;
}

const formatDateForInput = (isoString: string) => {
  const date = new Date(isoString);
  return format(date, 'yyyy-MM-dd');
};

const formatTimeForInput = (isoString: string) => {
  const date = new Date(isoString);
  return format(date, 'HH:mm');
};

const buildISO = (dateStr: string, timeStr: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return d.toISOString();
};

export const EditActivityDialog: React.FC<EditActivityDialogProps> = ({
  activity,
  open,
  onOpenChange,
  onSave,
}) => {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('other');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  useEffect(() => {
    if (activity) {
      setDescription(activity.description);
      setCategory(activity.category);
      setStartDate(formatDateForInput(activity.startTime));
      setStartTime(formatTimeForInput(activity.startTime));
      if (activity.endTime && !activity.isOngoing) {
        setEndDate(formatDateForInput(activity.endTime));
        setEndTime(formatTimeForInput(activity.endTime));
      } else {
        setEndDate('');
        setEndTime('');
      }
    }
  }, [activity]);

  const handleSave = () => {
    if (!activity || !startDate || !startTime) return;

    const newStartTime = buildISO(startDate, startTime);
    const newEndTime = endDate && endTime ? buildISO(endDate, endTime) : undefined;

    onSave(activity.id, {
      description,
      category,
      startTime: newStartTime,
      endTime: newEndTime,
      isOngoing: !newEndTime,
    });
    onOpenChange(false);
  };

  if (!activity) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" aria-describedby="edit-activity-description">
        <DialogHeader>
          <DialogTitle>Edit Activity</DialogTitle>
          <DialogDescription id="edit-activity-description">
            Modify the activity details below. Changes will update the timeline.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <CategorySelect value={category} onValueChange={setCategory} id="category" />
          </div>
          <div className="space-y-2">
            <Label>Start</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>End</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder={activity.isOngoing ? '' : ''}
              />
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            {activity.isOngoing && !endTime && (
              <p className="text-xs text-muted-foreground">Leave empty to keep ongoing</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
