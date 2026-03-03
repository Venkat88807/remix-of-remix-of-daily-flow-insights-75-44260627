

# Fix: Keep App Usage Out of Timeline, Clarify Data Flow

## Problem
1. App usage entries (often seconds-long) flood the timeline, making it unreadable
2. User confused about why only certain apps appear (answer: only logged/imported apps show up)

## Changes

### 1. Remove app logs from the timeline in UnifiedDayView.tsx
- Keep the **donut chart** showing both activities + app usage (this is useful for the "where did my day go" view)
- Keep the **collapsed app usage summary** card (grouped by app, expandable sessions)
- **Remove** app entries from the vertical timeline — only show manual activity logs + gap detection there
- This means deleting the block (lines ~120-131) that pushes app logs into `allEntries`

### 2. Keep donut chart inclusive
- The donut still shows both activity categories AND app usage totals — giving the full 24h picture
- Timeline stays clean with just your activities and untracked gaps

### 3. No app filtering changes needed
- All apps from `app_usage_logs` already show up. The "missing" apps simply haven't been imported yet
- No code change needed here, just clarification

## Technical Details

### File: `src/components/UnifiedDayView.tsx`
- Remove the section (~lines 120-131) that adds individual app log entries to `allEntries` for the timeline
- Keep the app grouping logic (`groups` Map) for the collapsed summary card and donut chart
- Gap detection will now only apply between manual activities, which makes more sense

### Result
- **Timeline**: Clean, only your logged activities + gaps between them
- **Donut**: Full picture including app usage totals
- **App Summary card**: Collapsed app groups with expandable sessions
- All three work together without the timeline being overwhelmed

