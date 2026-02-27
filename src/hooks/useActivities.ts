import { useState, useEffect, useCallback } from 'react';
import { Activity, DayData } from '@/types/activity';
import { format } from 'date-fns';

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

  // Get activities for the selected date
  const todayData = allData.find(d => d.date === activeDate);
  const activities = todayData?.activities || [];

  // Get ongoing activity
  const ongoingActivity = activities.find(a => a.isOngoing);

  // Add a new activity
  // Add a new activity
  const addActivity = useCallback((activity: Omit<Activity, 'id'> & { isOngoing?: boolean }) => {
    const currentTime = getISTTime();
    const currentDate = getISTDate();

    setAllData(prev => {
      let updated = [...prev];
      let dayIndex = updated.findIndex(d => d.date === currentDate);
      
      if (dayIndex === -1) {
        updated.push({ date: currentDate, activities: [] });
        dayIndex = updated.length - 1;
      }

      // If adding an ongoing activity, stop any existing ongoing activities
      if (activity.isOngoing !== false) {
        updated[dayIndex] = {
          ...updated[dayIndex],
          activities: updated[dayIndex].activities.map(a => {
            if (a.isOngoing) {
              const endTime = activity.startTime || currentTime;
              return {
                ...a,
                isOngoing: false,
                endTime,
                duration: calculateDuration(a.startTime, endTime),
              };
            }
            return a;
          }),
        };
      }

      // Add new activity
      const newActivity: Activity = {
        id: generateId(),
        description: activity.description,
        category: activity.category,
        startTime: activity.startTime || currentTime,
        endTime: activity.endTime,
        duration: activity.duration ?? (activity.endTime 
          ? calculateDuration(activity.startTime || currentTime, activity.endTime)
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

  // Stop ongoing activity
  const stopOngoingActivity = useCallback((endTime?: string) => {
    const stopTime = endTime || getISTTime();
    const currentDate = getISTDate();

    setAllData(prev => {
      return prev.map(day => {
        if (day.date === currentDate) {
          return {
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
          };
        }
        return day;
      });
    });
  }, []);

  // Delete an activity
  const deleteActivity = useCallback((activityId: string) => {
    setAllData(prev => {
      return prev.map(day => ({
        ...day,
        activities: day.activities.filter(a => a.id !== activityId),
      }));
    });
  }, []);

  // Update an activity
  const updateActivity = useCallback((activityId: string, updates: Partial<Activity>) => {
    console.log('updateActivity called:', activityId, 'updates:', JSON.stringify(updates));
    setAllData(prev => {
      const newData = prev.map(day => ({
        ...day,
        activities: day.activities.map(a => {
          if (a.id === activityId) {
            const updatedActivity = { ...a, ...updates };
            if (updatedActivity.startTime && updatedActivity.endTime) {
              updatedActivity.duration = calculateDuration(
                updatedActivity.startTime,
                updatedActivity.endTime
              );
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
