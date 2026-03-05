

# Simplify the "Where Did My Time Go?" Experience

## The Core Insight
You don't need a detailed app usage timeline. At 10pm, you want one glance that answers: "where did my day go?" That means your activities + total screentime per app, not individual app sessions.

## Current Problem — Too Much Redundancy on Today Tab
Right now the Today tab shows:
1. **UnifiedDayView** — coverage bar, donut chart, app summary card, activity timeline
2. **Activity Timeline** card (separate, duplicate of what's in UnifiedDayView)
3. **TimeCharts** (another donut/bar chart of just activities)
4. **AppSessionTimer** 
5. **SessionIntegrity**
6. **DailyInsights**

That's 6 cards/sections, with the activity timeline shown twice and two separate donut charts.

## Plan

### 1. Remove duplicate components from Today tab
- **Remove** the standalone `ActivityTimeline` card — it's already in UnifiedDayView's timeline
- **Remove** `TimeCharts` — the UnifiedDayView donut already covers this better (includes apps)
- Keep `DailyInsights` and `SessionIntegrity` as they add unique value

### 2. Simplify the App Summary in UnifiedDayView  
- Remove the collapsible session details (individual session times) — just show app name + total screentime
- Simpler, scannable list: `Instagram — 1h 12m`, `YouTube — 45m`, etc.
- Sort by duration descending — biggest time sinks at top

### 3. Keep what works
- **Coverage bar** — quick "X% of day accounted for"
- **Donut chart** — full picture of activities + app screentime + untracked
- **Activity timeline** — your logged activities with gap detection
- **App screentime list** — simple totals, no session breakdown

## Files to Modify

### `src/pages/Index.tsx`
- Remove the standalone `ActivityTimeline` card and `TimeCharts` from the Today tab grid
- Clean up the layout to just: input → UnifiedDayView → small utility cards

### `src/components/UnifiedDayView.tsx`
- Replace the collapsible app groups with a flat screentime list (app name + total time, no expand)
- Remove `Collapsible` imports and expanded state management

