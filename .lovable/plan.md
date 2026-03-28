

# Include App Usage in Monthly/All-Time Stats + Track Distractions

## What This Solves
Currently, MonthlyAnalysis and AllTimeStats only count manual activity logs (work, coding, meetings) for work totals and only native distraction events for distraction totals. Screenshot-based app usage (from `app_usage_logs` and `screentime-sessions`) is completely ignored in these views. The user wants:
1. Productive app usage (apps classified as work) to count toward work totals
2. Distractive app usage to count toward distraction totals
3. This to work across monthly and all-time views

## Changes

### 1. `src/components/MonthlyAnalysis.tsx`
- Accept `snapshotSessions` as a prop (from localStorage `screentime-sessions`)
- Load app classifications from Supabase `app_categories` table
- For each day in the month, aggregate snapshot diffs: apps marked productive add to work, apps marked distractive add to distraction totals
- Also query `app_usage_logs` for the month's date range to include imported screenshot data classified by `app_categories.is_work_app`
- Show a new "Screen Time" stat card alongside Work/Distraction/Integrity

### 2. `src/components/AllTimeStats.tsx`
- Already loads `appUsageStats` and `allSnapshotSessions` but doesn't classify them
- Load `app_categories` to know which apps are productive vs distractive
- Split `appUsageStats` into productive and distractive buckets
- Add productive app time to `totalProductiveMin`
- Add distractive app time to `totalDistractionMin`
- Show separate "Productive Apps" and "Distractive Apps" in the screen time list
- Monthly trend chart should include app-based work time too

### 3. `src/pages/Index.tsx`
- Pass `snapshotSessions` to `MonthlyAnalysis` (already available in state)

## Technical Details

- App classification source: `app_categories` table (`is_work_app` boolean) + local overrides from `session-app-classifications` localStorage key
- `app_usage_logs` stores imported screenshot data with `duration_seconds` per app per `usage_date`
- `screentime-sessions` localStorage stores before/after snapshot diffs with `totalDistractionSeconds`
- Both sources need to be merged, deduplicated by app name, and classified

