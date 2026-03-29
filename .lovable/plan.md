

# Improve App Classification UX + Include App Usage in Stats

## Current State
The app classification UI in SessionIntegrity has two small buttons per app: a pill toggle ("✓ Work" / "✗ Waste") for session-level and a tiny gear icon for global pinning. This is functional but not very intuitive — the gear icon's purpose is unclear and there's no way to manage all classified apps in one place.

The AllTimeStats and MonthlyAnalysis were recently updated to include app usage in work/distraction totals — that's already done.

## Changes

### 1. Better Classification UI in SessionIntegrity
- Replace the current pill + gear combo with a **segmented toggle** per app: `Work | Waste` with clear active states (green/red backgrounds)
- Add a **"Remember" checkbox or toggle** next to each app that saves the classification globally (replaces the cryptic gear icon)
- When "Remember" is on, show a small pin/lock icon so the user knows it's saved permanently

### 2. Dedicated App Classification Manager
- Add a new section/dialog accessible from Settings or the App Usage page
- Lists all apps from `app_categories` table
- Each app shows: name, current classification (Work/Waste), toggle to change
- Can bulk-classify or search apps
- This gives a single place to manage all global classifications

### 3. Files to Change
- **`src/components/SessionIntegrity.tsx`** — Redesign per-app row with segmented toggle + "Remember" option
- **`src/components/AppClassificationManager.tsx`** (new) — Standalone dialog/page for managing all app classifications from `app_categories`
- **`src/pages/Index.tsx`** — Add access point to the classification manager (e.g. in settings area or app usage tab)

## Technical Details
- Global classifications: upsert to `app_categories` table with `is_work_app` boolean
- Session overrides: continue using `session-app-classifications` localStorage key
- The segmented toggle uses existing shadcn ToggleGroup component
- Classification manager queries `app_categories` + `app_usage_logs` (distinct app names) to show all known apps

