import React, { useRef, useCallback, useMemo } from 'react';
import { Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Activity, getCategoryColor, getCategoryLabel } from '@/types/activity';
import { AppUsageLog } from '@/hooks/useAppUsage';

interface VisualExportProps {
  activities: Activity[];
  appLogs: AppUsageLog[];
  selectedDate: string;
}

function fmtDur(mins: number): string {
  if (mins < 1) return '<1m';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtSec(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export const VisualExport: React.FC<VisualExportProps> = ({ activities, appLogs, selectedDate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stats = useMemo(() => {
    const categoryTotals = new Map<string, number>();
    let totalWorkMins = 0;

    activities.forEach(a => {
      const dur = Math.max(0, a.duration || 0);
      if (dur <= 0) return;
      const label = getCategoryLabel(a.category);
      categoryTotals.set(label, (categoryTotals.get(label) || 0) + dur);
      if (['work', 'coding', 'meetings'].includes(a.category)) totalWorkMins += dur;
    });

    const dayLogs = appLogs.filter(l => l.usageDate === selectedDate);
    const appTotals = new Map<string, number>();
    dayLogs.forEach(l => {
      appTotals.set(l.appName, (appTotals.get(l.appName) || 0) + l.durationSeconds);
    });
    const topApps = Array.from(appTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const totalScreenSecs = dayLogs.reduce((s, l) => s + l.durationSeconds, 0);
    const totalTrackedMins = Array.from(categoryTotals.values()).reduce((s, v) => s + v, 0) + totalScreenSecs / 60;

    return {
      categoryTotals: Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1]),
      topApps,
      totalWorkMins,
      totalScreenSecs,
      totalTrackedMins,
    };
  }, [activities, appLogs, selectedDate]);

  const renderCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 800;
    const H = 1000;
    canvas.width = W * 2;
    canvas.height = H * 2;
    ctx.scale(2, 2);

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(1, '#1e293b');
    ctx.fillStyle = bg;
    ctx.roundRect(0, 0, W, H, 24);
    ctx.fill();

    // Date header
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dateStr = dateObj.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillText('Daily Summary', 40, 50);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(dateStr, 40, 85);

    // Divider
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 110);
    ctx.lineTo(W - 40, 110);
    ctx.stroke();

    // Big stats
    let yPos = 150;
    const drawBigStat = (label: string, value: string, color: string) => {
      ctx.fillStyle = color;
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillText(value, 40, yPos);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 16px system-ui, sans-serif';
      ctx.fillText(label, 40, yPos + 24);
      yPos += 80;
    };

    drawBigStat('Total Tracked', fmtDur(stats.totalTrackedMins), '#60a5fa');
    drawBigStat('Work Done', fmtDur(stats.totalWorkMins), '#34d399');
    drawBigStat('Screen Time', fmtSec(stats.totalScreenSecs), '#f472b6');

    // Divider
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(40, yPos);
    ctx.lineTo(W - 40, yPos);
    ctx.stroke();
    yPos += 30;

    // Activity categories
    if (stats.categoryTotals.length > 0) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText('Activities', 40, yPos);
      yPos += 30;

      stats.categoryTotals.forEach(([label, mins]) => {
        const barWidth = Math.min(500, (mins / (stats.totalTrackedMins || 1)) * 500);
        ctx.fillStyle = '#1e3a5f';
        ctx.roundRect(40, yPos - 14, 500, 28, 6);
        ctx.fill();
        ctx.fillStyle = '#3b82f6';
        ctx.roundRect(40, yPos - 14, Math.max(barWidth, 4), 28, 6);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.font = '500 14px system-ui, sans-serif';
        ctx.fillText(label, 52, yPos + 5);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(fmtDur(mins), W - 40, yPos + 5);
        ctx.textAlign = 'left';
        yPos += 38;
      });
      yPos += 10;
    }

    // Top apps
    if (stats.topApps.length > 0) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText('Top Apps', 40, yPos);
      yPos += 30;

      stats.topApps.forEach(([name, secs]) => {
        const barWidth = Math.min(500, (secs / (stats.topApps[0][1] || 1)) * 500);
        ctx.fillStyle = '#2d1b4e';
        ctx.roundRect(40, yPos - 14, 500, 28, 6);
        ctx.fill();
        ctx.fillStyle = '#8b5cf6';
        ctx.roundRect(40, yPos - 14, Math.max(barWidth, 4), 28, 6);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.font = '500 14px system-ui, sans-serif';
        ctx.fillText(name, 52, yPos + 5);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(fmtSec(secs), W - 40, yPos + 5);
        ctx.textAlign = 'left';
        yPos += 38;
      });
    }

    // Footer
    ctx.fillStyle = '#475569';
    ctx.font = '400 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time Tracker · AI-powered personal time tracking', W / 2, H - 30);
    ctx.textAlign = 'left';
  }, [selectedDate, stats]);

  const handleDownload = useCallback(() => {
    renderCard();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `time-summary-${selectedDate}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [renderCard, selectedDate]);

  const handleShare = useCallback(async () => {
    renderCard();
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      if (navigator.share) {
        await navigator.share({
          files: [new File([blob], `time-summary-${selectedDate}.png`, { type: 'image/png' })],
          title: 'My Day Summary',
        });
      } else {
        handleDownload();
      }
    } catch {
      handleDownload();
    }
  }, [renderCard, selectedDate, handleDownload]);

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
          <Download className="h-4 w-4" /> Visual Export
        </Button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
            <Share2 className="h-4 w-4" /> Share
          </Button>
        )}
      </div>
    </>
  );
};
