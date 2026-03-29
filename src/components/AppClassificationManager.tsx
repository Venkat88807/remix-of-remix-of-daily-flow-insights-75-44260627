import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AppEntry {
  id?: string;
  app_name: string;
  is_work_app: boolean;
}

interface AppClassificationManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AppClassificationManager: React.FC<AppClassificationManagerProps> = ({ open, onOpenChange }) => {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      // Get all known apps from app_categories + app_usage_logs
      const [catRes, logRes] = await Promise.all([
        supabase.from('app_categories').select('id, app_name, is_work_app'),
        supabase.from('app_usage_logs').select('app_name'),
      ]);

      const map = new Map<string, AppEntry>();
      if (catRes.data) {
        catRes.data.forEach(c => map.set(c.app_name.toLowerCase(), {
          id: c.id,
          app_name: c.app_name,
          is_work_app: c.is_work_app ?? false,
        }));
      }
      if (logRes.data) {
        logRes.data.forEach(l => {
          const key = l.app_name.toLowerCase();
          if (!map.has(key)) {
            map.set(key, { app_name: l.app_name, is_work_app: false });
          }
        });
      }

      setApps(Array.from(map.values()).sort((a, b) => a.app_name.localeCompare(b.app_name)));
      setLoading(false);
    };
    load();
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return apps;
    const q = search.toLowerCase();
    return apps.filter(a => a.app_name.toLowerCase().includes(q));
  }, [apps, search]);

  const toggleApp = async (app: AppEntry) => {
    const newVal = !app.is_work_app;
    const lower = app.app_name.toLowerCase();

    if (app.id) {
      await supabase.from('app_categories').update({ is_work_app: newVal }).eq('id', app.id);
    } else {
      const { data } = await supabase.from('app_categories').insert({
        app_name: app.app_name,
        package_name: lower.replace(/\s+/g, '.'),
        is_work_app: newVal,
        category: newVal ? 'work' : 'distraction',
      }).select('id').single();
      if (data) app.id = data.id;
    }

    setApps(prev => prev.map(a =>
      a.app_name.toLowerCase() === lower ? { ...a, is_work_app: newVal } : a
    ));
    toast.success(`${app.app_name} → ${newVal ? 'Work' : 'Waste'}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            App Classifications
          </DialogTitle>
          <DialogDescription>
            Set which apps count as productive work vs distractions. This affects your session integrity and stats.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search apps..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[350px] -mx-2 px-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No apps found</p>
          ) : (
            <div className="space-y-1">
              {filtered.map(app => (
                <div key={app.app_name} className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50">
                  <span className="text-sm truncate flex-1 mr-3">{app.app_name}</span>
                  <div className="flex rounded-md overflow-hidden border border-border shrink-0">
                    <button
                      onClick={() => { if (!app.is_work_app) toggleApp(app); }}
                      className={`text-xs font-medium px-3 py-1.5 transition-colors ${
                        app.is_work_app
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-transparent text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Work
                    </button>
                    <button
                      onClick={() => { if (app.is_work_app) toggleApp(app); }}
                      className={`text-xs font-medium px-3 py-1.5 transition-colors ${
                        !app.is_work_app
                          ? 'bg-destructive/20 text-destructive'
                          : 'bg-transparent text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Waste
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
