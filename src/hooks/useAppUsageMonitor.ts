import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppUsage from '@/plugins/AppUsagePlugin';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export interface DistractionEvent {
  id?: string;
  packageName: string;
  appName: string;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
  isWorkRelated?: boolean;
  userResponded: boolean;
  currentActivityDescription?: string;
}

export interface AppCategory {
  packageName: string;
  appName: string;
  category: string;
  isWorkApp: boolean;
}

// System/keyboard packages to always ignore
const IGNORED_PACKAGES = [
  'com.android.systemui',
  'com.google.android.inputmethod',
  'com.samsung.android.honeyboard',
  'com.swiftkey',
  'com.touchtype.swiftkey',
  'com.android.inputmethod',
  'com.sec.android.inputmethod',
  'com.google.android.apps.nexuslauncher',
  'com.samsung.android.app.launcher',
  'com.android.launcher',
  'com.sec.android.app.launcher',
  'android',
  'com.android.settings',
  'statusbar',
];

function isIgnoredPackage(pkg: string): boolean {
  return IGNORED_PACKAGES.some(ignored => pkg.toLowerCase().includes(ignored.toLowerCase()));
}

export function useAppUsageMonitor(currentActivityDescription?: string) {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const lastLoggedAppRef = { current: '' };
  const [hasPermission, setHasPermission] = useState(false);
  const [pendingDistraction, setPendingDistraction] = useState<DistractionEvent | null>(null);
  const [distractionHistory, setDistractionHistory] = useState<DistractionEvent[]>([]);
  const [appCategories, setAppCategories] = useState<AppCategory[]>([]);
  const [isNative, setIsNative] = useState(false);

  // Check if running on native platform
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Load app categories from database
  const loadAppCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_categories')
      .select('*');
    
    if (!error && data) {
      setAppCategories(data.map(d => ({
        packageName: d.package_name,
        appName: d.app_name,
        category: d.category,
        isWorkApp: d.is_work_app
      })));
    }
  }, []);

  // Load distraction history
  const loadDistractionHistory = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('app_distractions')
      .select('*')
      .gte('started_at', today.toISOString())
      .order('started_at', { ascending: false });
    
    if (!error && data) {
      setDistractionHistory(data.map(d => ({
        id: d.id,
        packageName: d.package_name,
        appName: d.app_name,
        startedAt: new Date(d.started_at),
        endedAt: d.ended_at ? new Date(d.ended_at) : undefined,
        durationSeconds: d.duration_seconds ?? undefined,
        isWorkRelated: d.is_work_related ?? undefined,
        userResponded: d.user_responded,
        currentActivityDescription: d.current_activity_description ?? undefined
      })));
    }
  }, []);

  useEffect(() => {
    loadAppCategories();
    loadDistractionHistory();
  }, [loadAppCategories, loadDistractionHistory]);

  // Check permission status
  const checkPermission = useCallback(async () => {
    if (!isNative) return false;
    
    try {
      const result = await AppUsage.hasPermission();
      setHasPermission(result.granted);
      return result.granted;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }, [isNative]);

  // Request permission
  const requestPermission = useCallback(async () => {
    if (!isNative) {
      alert('App usage detection requires the native Android app.');
      return;
    }
    
    try {
      await AppUsage.requestPermission();
      // Check again after user returns from settings
      setTimeout(() => checkPermission(), 1000);
    } catch (error) {
      console.error('Error requesting permission:', error);
    }
  }, [isNative, checkPermission]);

  // Show local notification for distraction
  const showDistractionNotification = useCallback(async (appName: string, durationSec: number) => {
    if (!isNative) return;
    
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: '🎯 Focus Check',
            body: `You spent ${Math.round(durationSec / 60)} min on ${appName}. Was this work-related?`,
            id: Date.now(),
            actionTypeId: 'DISTRACTION_RESPONSE',
            extra: { type: 'distraction' }
          }
        ]
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }, [isNative]);

  // Handle app switch event
  const handleAppSwitch = useCallback(async (event: {
    fromApp: string;
    toApp: string;
    toAppName: string;
    timestamp: number;
    isDistraction: boolean;
  }) => {
    // Ignore system UI, keyboards, launchers
    if (isIgnoredPackage(event.toApp) || isIgnoredPackage(event.fromApp)) return;

    const isOurApp = event.toApp.includes('lovable') || event.toApp.includes('b0feeaf1') || event.toApp.includes('time-guardian');

    // Check if returning to our app after being in a distraction app
    const isReturning = isOurApp;

    // Deduplicate: only process if the app actually changed (skip for our own app returning)
    if (!isOurApp) {
      if (event.toApp === lastLoggedAppRef.current) return;
      lastLoggedAppRef.current = event.toApp;
    }

    if (!event.isDistraction && !isReturning) return;
    
    if (isReturning && pendingDistraction) {
      // User is back - calculate duration and show prompt
      const endedAt = new Date(event.timestamp);
      const durationSeconds = Math.round((endedAt.getTime() - pendingDistraction.startedAt.getTime()) / 1000);
      
      // Only prompt if distraction was > 30 seconds
      if (durationSeconds > 30) {
        const updatedDistraction: DistractionEvent = {
          ...pendingDistraction,
          endedAt,
          durationSeconds
        };
        
        // Save to database
        const { data, error: insertError } = await supabase
          .from('app_distractions')
          .insert({
            package_name: updatedDistraction.packageName,
            app_name: updatedDistraction.appName,
            started_at: updatedDistraction.startedAt.toISOString(),
            ended_at: updatedDistraction.endedAt?.toISOString(),
            duration_seconds: updatedDistraction.durationSeconds,
            user_responded: false,
            current_activity_description: currentActivityDescription
          })
          .select()
          .maybeSingle();
        
        if (insertError) {
          console.error('Error inserting distraction:', insertError);
        }
        
        if (data) {
          updatedDistraction.id = data.id;
        }
        
        setPendingDistraction(updatedDistraction);
        showDistractionNotification(updatedDistraction.appName, durationSeconds);
      } else {
        setPendingDistraction(null);
      }
    } else if (event.isDistraction) {
      // User switched to a distraction app
      setPendingDistraction({
        packageName: event.toApp,
        appName: event.toAppName,
        startedAt: new Date(event.timestamp),
        userResponded: false,
        currentActivityDescription
      });
    }
  }, [pendingDistraction, currentActivityDescription, showDistractionNotification]);

  // Start monitoring
  const startMonitoring = useCallback(async () => {
    if (!isNative) return;
    
    const hasPerms = await checkPermission();
    if (!hasPerms) {
      requestPermission();
      return;
    }

    try {
      // Get work app package names
      const workApps = appCategories
        .filter(a => a.isWorkApp)
        .map(a => a.packageName);
      
      await AppUsage.startMonitoring({ 
        intervalMs: 5000,
        workApps 
      });
      
      // Listen for app switches
      await AppUsage.addListener('appSwitched', handleAppSwitch);
      
      setIsMonitoring(true);
    } catch (error) {
      console.error('Error starting monitoring:', error);
    }
  }, [isNative, checkPermission, requestPermission, appCategories, handleAppSwitch]);

  // Stop monitoring
  const stopMonitoring = useCallback(async () => {
    if (!isNative) return;
    
    try {
      await AppUsage.stopMonitoring();
      setIsMonitoring(false);
    } catch (error) {
      console.error('Error stopping monitoring:', error);
    }
  }, [isNative]);

  // Respond to distraction prompt
  const respondToDistraction = useCallback(async (isWorkRelated: boolean) => {
    if (!pendingDistraction?.id) return;
    
    await supabase
      .from('app_distractions')
      .update({
        is_work_related: isWorkRelated,
        user_responded: true
      })
      .eq('id', pendingDistraction.id);
    
    // Update local state
    setDistractionHistory(prev => prev.map(d => 
      d.id === pendingDistraction.id 
        ? { ...d, isWorkRelated, userResponded: true }
        : d
    ));
    
    setPendingDistraction(null);
    loadDistractionHistory();
  }, [pendingDistraction, loadDistractionHistory]);

  // Update app category
  const updateAppCategory = useCallback(async (packageName: string, isWorkApp: boolean) => {
    await supabase
      .from('app_categories')
      .update({ is_work_app: isWorkApp })
      .eq('package_name', packageName);
    
    loadAppCategories();
  }, [loadAppCategories]);

  // Calculate total distraction time for today (non-work-related)
  const getTodayDistractionTime = useCallback(() => {
    return distractionHistory
      .filter(d => d.userResponded && !d.isWorkRelated && d.durationSeconds)
      .reduce((sum, d) => sum + (d.durationSeconds || 0), 0);
  }, [distractionHistory]);

  return {
    isNative,
    isMonitoring,
    hasPermission,
    pendingDistraction,
    distractionHistory,
    appCategories,
    checkPermission,
    requestPermission,
    startMonitoring,
    stopMonitoring,
    respondToDistraction,
    updateAppCategory,
    getTodayDistractionTime,
    loadDistractionHistory
  };
}
