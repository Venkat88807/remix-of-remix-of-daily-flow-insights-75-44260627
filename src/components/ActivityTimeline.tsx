import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Clock, Trash2, Play, Pencil, AlertTriangle, CheckCircle2, Moon, Sun } from 'lucide-react';
import { Activity, getCategoryColor, getCategoryLabel } from '@/types/activity';
import { DistractionEvent } from '@/hooks/useAppUsageMonitor';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EditActivityDialog } from './EditActivityDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ActivityTimelineProps {
  activities: Activity[];
  onDelete: (id: string) => void;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  distractionHistory?: DistractionEvent[];
}

type TimelineItem =
  | { type: 'activity'; data: Activity; sortTime: number }
  | { type: 'distraction'; data: DistractionEvent; sortTime: number };

const formatTime = (isoString: string) => {
  const date = new Date(isoString);
  return format(date, 'HH:mm');
};

const formatDuration = (minutes?: number) => {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const formatSeconds = (seconds?: number) => {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
};

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  activities,
  onDelete,
  onUpdate,
  distractionHistory = [],
}) => {
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    activities.forEach(a => {
      items.push({ type: 'activity', data: a, sortTime: new Date(a.startTime).getTime() });
    });

    distractionHistory.forEach(d => {
      if (d.userResponded) {
        items.push({ type: 'distraction', data: d, sortTime: d.startedAt.getTime() });
      }
    });

    // Sort most recent first
    items.sort((a, b) => b.sortTime - a.sortTime);
    return items;
  }, [activities, distractionHistory]);

  if (timelineItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Clock className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No activities yet</p>
        <p className="text-sm">Start tracking by typing what you're doing above</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {timelineItems.map((item) => {
        if (item.type === 'distraction') {
          const d = item.data;
          const isWork = d.isWorkRelated === true;
          return (
            <div
              key={`distraction-${d.id ?? d.startedAt.getTime()}`}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border border-dashed text-sm",
                isWork
                  ? "border-muted bg-muted/30"
                  : "border-accent bg-accent/10"
              )}
            >
              {isWork ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-accent-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-medium">{d.appName}</span>
                <span className="text-muted-foreground ml-2">
                  {format(d.startedAt, 'HH:mm')}
                  {d.endedAt && ` — ${format(d.endedAt, 'HH:mm')}`}
                </span>
                {d.durationSeconds != null && (
                  <span className="text-muted-foreground ml-2">({formatSeconds(d.durationSeconds)})</span>
                )}
              </div>
              <span className={cn(
                "px-2 py-0.5 rounded text-xs font-medium shrink-0",
                isWork
                  ? "bg-muted text-muted-foreground"
                  : "bg-accent text-accent-foreground"
              )}>
                {isWork ? 'Work' : 'Distraction'}
              </span>
            </div>
          );
        }

        const activity = item.data;
        const isSleep = activity.category === 'sleep';

        if (isSleep) {
          const durationMs = activity.endTime
            ? new Date(activity.endTime).getTime() - new Date(activity.startTime).getTime()
            : 0;
          const durationHrs = Math.floor(durationMs / 3600000);
          const durationMins = Math.round((durationMs % 3600000) / 60000);

          return (
            <div key={activity.id} className="relative">
              {/* Fell asleep marker */}
              <div className="flex items-center gap-3 p-3 rounded-t-lg border border-b-0 bg-[hsl(220_70%_50%/0.08)] border-[hsl(220_70%_50%/0.3)]">
                <div className="w-8 h-8 rounded-full bg-[hsl(220_70%_50%)] flex items-center justify-center shrink-0">
                  <Moon className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Fell asleep</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(activity.startTime), 'EEE, MMM d · HH:mm')}
                  </p>
                </div>
              </div>

              {/* Duration connector */}
              <div className="flex items-center gap-3 px-3 py-2 border-x bg-[hsl(220_70%_50%/0.04)] border-[hsl(220_70%_50%/0.3)]">
                <div className="w-8 flex justify-center shrink-0">
                  <div className="w-0.5 h-6 bg-[hsl(220_70%_50%/0.3)]" />
                </div>
                <span className="text-xs font-bold text-muted-foreground tabular-nums">
                  {durationHrs > 0 ? `${durationHrs}h ${durationMins}m` : `${durationMins}m`} of sleep
                </span>
              </div>

              {/* Woke up marker */}
              <div className="flex items-center gap-3 p-3 rounded-b-lg border border-t-0 bg-[hsl(40_80%_55%/0.08)] border-[hsl(220_70%_50%/0.3)]">
                <div className="w-8 h-8 rounded-full bg-[hsl(40_80%_55%)] flex items-center justify-center shrink-0">
                  <Sun className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Woke up</p>
                  <p className="text-xs text-muted-foreground">
                    {activity.endTime
                      ? format(new Date(activity.endTime), 'EEE, MMM d · HH:mm')
                      : 'Still sleeping...'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground h-7 w-7"
                    onClick={() => setEditingActivity(activity)}
                    aria-label="Edit sleep entry"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive h-7 w-7"
                    onClick={() => setDeletingActivity(activity)}
                    aria-label="Delete sleep entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={activity.id}
            className={cn(
              "activity-block flex items-center gap-4 p-4 border",
              activity.isOngoing && "ring-2 ring-primary ring-offset-2 ring-offset-background"
            )}
            style={{
              backgroundColor: `${getCategoryColor(activity.category)}10`,
              borderColor: getCategoryColor(activity.category),
            }}
          >
            <div
              className="w-3 h-full min-h-[3rem] rounded-full shrink-0"
              style={{ backgroundColor: getCategoryColor(activity.category) }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium truncate">{activity.description}</h4>
                {activity.isOngoing && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    <Play className="h-3 w-3" />
                    Live
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: getCategoryColor(activity.category),
                    color: 'white',
                  }}
                >
                  {getCategoryLabel(activity.category)}
                </span>
                <span>
                  {formatTime(activity.startTime)}
                  {activity.isOngoing ? ' — Now' : activity.endTime ? ` — ${formatTime(activity.endTime)}` : ''}
                </span>
                {activity.duration != null && activity.duration > 0 && (
                  <span className="font-medium">{formatDuration(activity.duration)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setEditingActivity(activity)}
                aria-label={`Edit ${activity.description}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeletingActivity(activity)}
                aria-label={`Delete ${activity.description}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        );
      })}

      <EditActivityDialog
        activity={editingActivity}
        open={!!editingActivity}
        onOpenChange={(open) => !open && setEditingActivity(null)}
        onSave={onUpdate}
      />

      <AlertDialog open={!!deletingActivity} onOpenChange={(open) => !open && setDeletingActivity(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Activity?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingActivity?.description}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingActivity) {
                  onDelete(deletingActivity.id);
                  setDeletingActivity(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
