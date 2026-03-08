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

const formatTimeForInput = (isoString: string) => {
  const date = new Date(isoString);
  return format(date, 'HH:mm');
};

const parseTimeToISO = (timeString: string, referenceDate: string): string => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const refDate = new Date(referenceDate);
  refDate.setHours(hours, minutes, 0, 0);
  return refDate.toISOString();
};

export const EditActivityDialog: React.FC<EditActivityDialogProps> = ({
  activity,
  open,
  onOpenChange,
  onSave,
}) => {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('other');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  useEffect(() => {
    if (activity) {
      setDescription(activity.description);
      setCategory(activity.category);
      setStartTime(formatTimeForInput(activity.startTime));
      setEndTime(activity.endTime && !activity.isOngoing ? formatTimeForInput(activity.endTime) : '');
    }
  }, [activity]);

  const handleSave = () => {
    if (!activity) return;

    const newStartTime = parseTimeToISO(startTime, activity.startTime);
    const newEndTime = endTime ? parseTimeToISO(endTime, activity.startTime) : undefined;

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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder={activity.isOngoing ? 'Ongoing' : ''}
              />
              {activity.isOngoing && !endTime && (
                <p className="text-xs text-muted-foreground">Leave empty to keep ongoing</p>
              )}
            </div>
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
