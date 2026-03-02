

# Unified "My Day" View — Timeline + Donut + Collapsed App Entries

## Goal
Track where every minute of your day goes, presented as:
1. A **visual timeline** (vertical, time-ordered) merging both your activity logs and app usage logs
2. A **donut chart** showing the full-day breakdown
3. **Collapsed app entries** — e.g., 3 separate "YouTube" logs become one collapsible row showing total time + individual session times

## Current State
- **Activities** (work, coding, meals, etc.) are stored in localStorage via `useActivities`
- **App usage** (Instagram, YouTube, etc.) is stored in Supabase via `useAppUsage`
- These live in separate tabs ("Today" vs "Apps") with no unified view
- The existing `TimeCharts` component already has a donut chart but only for activity categories

## Plan

### 1. Create a Unified Day View component
A new `UnifiedDayView` component that merges both data sources into one timeline:

- **Data merging**: Combine activities (from localStorage) and app usage logs (from Supabase) for the selected date into a single sorted list
- **Visual timeline**: Vertical timeline with time markers on the left (like 9:00, 9:30, 10:00...) and blocks on the right
  - Activity blocks: colored by category (work, coding, meals, etc.)
  - App usage blocks: colored by app with app icon/initial
- **Collapsed app entries**: Group consecutive or repeated app entries (e.g., YouTube x3) into a single collapsible row using the Collapsible component
  - Header shows: app name, total duration, count of sessions
  - Expand to see individual session times (e.g., "09:15 - 09:30", "11:00 - 11:20")

### 2. Full-Day Donut Chart
A donut chart showing all time accounted for:
- Inner ring or single ring with segments for each category + each app
- Center text: total tracked time vs 24h (e.g., "14h 30m / 24h")
- Untracked time shown as a grey "Gap" segment
- Legend below with color-coded entries

### 3. Integration into Today Tab
Replace or augment the current Today tab layout:
- Move the unified timeline into the main card where `ActivityTimeline` currently sits
- Add a toggle/tabs: "Timeline" vs "List" so users can switch between the new visual timeline and the existing list view
- Place the full-day donut chart alongside (or above on mobile)

### 4. Collapsible Logic for App Usage
In the app usage section (both in unified timeline and the Apps tab):
- Group logs by `appName` for the selected date
- Show one row per app with total time
- Expandable to show individual sessions with timestamps
- Each session row shows start time, end time, duration

## Technical Details

### Files to create:
- `src/components/UnifiedDayView.tsx` — main unified view with timeline + donut

### Files to modify:
- `src/pages/Index.tsx` — integrate `UnifiedDayView` into the Today tab, pass both activity and app usage data
- `src/components/AppUsagePage.tsx` — add collapsible grouping to the daily Activity Log section
- `src/components/TimeCharts.tsx` — enhance to accept optional app usage data for the combined donut chart

### Data flow:
- `useActivities(selectedDate)` provides activity entries
- `useAppUsage()` provides app usage logs
- Both are passed to `UnifiedDayView` which merges, sorts by time, groups apps, and renders

### Recommendations:
- **Gap detection**: Show grey "untracked" blocks in the timeline for periods with no logged activity or app usage — this helps you see where minutes are leaking
- **24h coverage meter**: A simple progress bar showing how much of the day is accounted for (e.g., "You've tracked 16h 20m of 24h")
- **Quick-add from gaps**: Tapping a gap block opens the manual activity input pre-filled with that time range

