import { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, DayData } from '@/types/activity';

const STORAGE_KEY = 'time-tracker-data';

const generateId = () => Math.random().toString(36).substring(2, 15);

const getISTDate = (): string => {
  // Get current date using local date components (not UTC)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getISTTime = (): string => {
  return new Date().toISOString();
};

const calculateDuration = (start: string, end: string): number => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
};

const getDateKeyFromISO = (isoString: string): string => {
  const dt = new Date(isoString);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// Load initial data from localStorage
const loadStoredData = (): DayData[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to parse stored data:', e);
  }
  return [];
};

export const useActivities = (selectedDate?: string) => {
  const [allData, setAllData] = useState<DayData[]>(loadStoredData);
  const [isLoading, setIsLoading] = useState(false);

  const today = getISTDate();
  const activeDate = selectedDate || today;

  // Sync to localStorage whenever allData changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
    console.log('Saved to localStorage:', allData.length, 'days');
  }, [allData]);

  // Get activities for selected date, including any segment that overlaps this day
  const activities = useMemo(() => {
    const [y, m, d] = activeDate.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    const now = new Date();

    const result: Activity[] = [];

    allData.forEach((day) => {
      day.activities.forEach((activity) => {
        if (!activity.startTime) return;

        const activityStart = new Date(activity.startTime);
        if (Number.isNaN(activityStart.getTime())) return;

        const rawEnd = activity.endTime ? new Date(activity.endTime) : now;
        if (Number.isNaN(rawEnd.getTime())) return;

        const activityEnd = rawEnd.getTime() < activityStart.getTime() ? activityStart : rawEnd;

        const overlapsSelectedDay = activityStart < dayEnd && activityEnd > dayStart;
        if (!overlapsSelectedDay) return;

        const segmentStart = activityStart > dayStart ? activityStart : dayStart;
        const segmentEnd = activityEnd < dayEnd ? activityEnd : dayEnd;

        if (segmentEnd.getTime() <= segmentStart.getTime()) return;

        const isClipped =
          segmentStart.getTime() !== activityStart.getTime() ||
          segmentEnd.getTime() !== activityEnd.getTime();

        result.push({
          ...activity,
          id: isClipped ? `${activity.id}-spill` : activity.id,
          startTime: segmentStart.toISOString(),
          endTime: segmentEnd.toISOString(),
          duration: Math.round((segmentEnd.getTime() - segmentStart.getTime()) / 60000),
          isOngoing: activity.isOngoing && activeDate === today,
        });
      });
    });

    result.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return result;
  }, [allData, activeDate, today]);

  // Get ongoing activity
  const ongoingActivity = activities.find(a => a.isOngoing);

  // Add a new activity
  const addActivity = useCallback((activity: Omit<Activity, 'id'> & { isOngoing?: boolean }) => {
    const currentTime = getISTTime();
    const startTime = activity.startTime || currentTime;
    const targetDate = getDateKeyFromISO(startTime);

    setAllData(prev => {
      let updated = [...prev];
      let dayIndex = updated.findIndex(d => d.date === targetDate);

      if (dayIndex === -1) {
        updated.push({ date: targetDate, activities: [] });
        dayIndex = updated.length - 1;
      }

      // If adding an ongoing activity, stop any existing ongoing activity across all days
      if (activity.isOngoing !== false) {
        updated = updated.map(day => ({
          ...day,
          activities: day.activities.map(a => {
            if (a.isOngoing) {
              const endTime = startTime;
              return {
                ...a,
                isOngoing: false,
                endTime,
                duration: calculateDuration(a.startTime, endTime),
              };
            }
            return a;
          }),
        }));
      }

      // Add new activity
      const newActivity: Activity = {
        id: generateId(),
        description: activity.description,
        category: activity.category,
        startTime,
        endTime: activity.endTime,
        duration: activity.duration ?? (activity.endTime
          ? calculateDuration(startTime, activity.endTime)
          : undefined),
        isOngoing: activity.isOngoing ?? true,
      };

      updated[dayIndex] = {
        ...updated[dayIndex],
        activities: [...updated[dayIndex].activities, newActivity],
      };

      console.log('Adding activity:', newActivity.description, 'Total activities:', updated[dayIndex].activities.length);
      return updated;
    });
  }, []);

  // Stop ongoing activity (even if it started on a previous day)
  const stopOngoingActivity = useCallback((endTime?: string) => {
    const stopTime = endTime || getISTTime();

    setAllData(prev => {
      return prev.map(day => ({
        ...day,
        activities: day.activities.map(a => {
          if (a.isOngoing) {
            return {
              ...a,
              isOngoing: false,
              endTime: stopTime,
              duration: calculateDuration(a.startTime, stopTime),
            };
          }
          return a;
        }),
      }));
    });
  }, []);

  // Delete an activity
  const deleteActivity = useCallback((activityId: string) => {
    const realId = activityId.replace(/-spill$/, '');
    setAllData(prev => {
      return prev.map(day => ({
        ...day,
        activities: day.activities.filter(a => a.id !== realId),
      }));
    });
  }, []);

  // Update an activity
  const updateActivity = useCallback((activityId: string, updates: Partial<Activity>) => {
    const realId = activityId.replace(/-spill$/, '');
    console.log('updateActivity called:', realId, 'updates:', JSON.stringify(updates));
    setAllData(prev => {
      const newData = prev.map(day => ({
        ...day,
        activities: day.activities.map(a => {
          if (a.id === realId) {
            const updatedActivity = { ...a, ...updates };
            if (updatedActivity.startTime && updatedActivity.endTime) {
              updatedActivity.duration = calculateDuration(
                updatedActivity.startTime,
                updatedActivity.endTime
              );
            }
            // Track category corrections for AI learning
            if (updates.category && updates.category !== a.category) {
              saveCategoryCorrection(a.description, a.category, updates.category);
            }
            console.log('Activity updated:', a.category, '->', updatedActivity.category);
            return updatedActivity;
          }
          return a;
        }),
      }));
      return newData;
    });
  }, []);

  // Export data with correct local date in filename
  const exportData = useCallback(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const dataStr = JSON.stringify(allData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `time-tracker-export-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allData]);

  // Import data
  const importData = useCallback((jsonData: string) => {
    try {
      const parsed = JSON.parse(jsonData);
      if (Array.isArray(parsed)) {
        setAllData(parsed);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to import data:', e);
      return false;
    }
  }, []);

  // Clear all data
  const clearAllData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAllData([]);
  }, []);

  // Get all dates with data
  const datesWithData = allData.map(d => d.date);

  return {
    activities,
    allData,
    ongoingActivity,
    isLoading,
    addActivity,
    stopOngoingActivity,
    deleteActivity,
    updateActivity,
    exportData,
    importData,
    clearAllData,
    datesWithData,
    today,
  };
};
