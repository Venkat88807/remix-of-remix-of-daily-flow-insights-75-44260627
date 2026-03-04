import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseDurationSeconds(durationSeconds: unknown, durationText: unknown): number {
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return Math.round(durationSeconds);
  }

  const raw = typeof durationText === "string" ? durationText.trim().toLowerCase() : "";
  if (!raw) return 0;

  let total = 0;

  const hourMatches = raw.matchAll(/(\d+)\s*(h|hr|hrs|hour|hours)\b/g);
  for (const m of hourMatches) total += Number(m[1]) * 3600;

  const minuteMatches = raw.matchAll(/(\d+)\s*(m|min|mins|minute|minutes)\b/g);
  for (const m of minuteMatches) total += Number(m[1]) * 60;

  const secondMatches = raw.matchAll(/(\d+)\s*(s|sec|secs|second|seconds)\b/g);
  for (const m of secondMatches) total += Number(m[1]);

  if (total > 0) return total;

  const clock = raw.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (clock) {
    const a = Number(clock[1]);
    const b = Number(clock[2]);
    const c = clock[3] ? Number(clock[3]) : undefined;
    if (c !== undefined) return a * 3600 + b * 60 + c;
    return a * 60 + b;
  }

  return 0;
}

function normalizeTime(time: unknown): string | null {
  if (typeof time !== "string") return null;
  const trimmed = time.trim();
  return trimmed.length > 0 ? trimmed : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, date } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Extract EVERY visible app usage row from screenshots of app-usage trackers.

Rules:
- Capture all real apps you can read, including long sessions (30m+)
- Do not collapse duplicates: if an app appears on multiple rows, return multiple entries
- Time can be null if not visible in the screenshot
- durationText must be the exact text shown (examples: "30 min", "01 mins 13 sec", "1h 12m", "00:42")
- durationSeconds should be the converted value when possible
- Skip only rows that are explicitly zero duration ("0 sec", "00 sec")
- Skip system/OS entries like "Screen locked", "Screen on", "Screen off", "Device idle", "Phone locked", "Screen timeout", any launcher/home screen entries, keyboard apps, or system UI elements — these are NOT app usage
- If uncertain about an app name, still include best readable text rather than dropping the row`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract all visible app usage entries from this screenshot. Date context: ${date || "today"}`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${cleanBase64}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_usage_entries",
              description: "Extract every visible app usage row from screenshot",
              parameters: {
                type: "object",
                properties: {
                  entries: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        appName: { type: "string", description: "App name exactly as shown" },
                        time: { type: ["string", "null"], description: "Displayed time if visible, otherwise null" },
                        durationText: { type: "string", description: "Raw duration string as displayed" },
                        durationSeconds: { type: ["integer", "null"], description: "Duration converted to seconds if possible" },
                      },
                      required: ["appName", "durationText"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["entries"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_usage_entries" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again in a moment" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(
        JSON.stringify({ error: "Could not parse screenshot", entries: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];

    const seen = new Set<string>();
    const entries = rawEntries
      .map((entry: any) => {
        const appName = typeof entry?.appName === "string" ? entry.appName.trim() : "";
        const durationSeconds = parseDurationSeconds(entry?.durationSeconds, entry?.durationText);
        const time = normalizeTime(entry?.time);
        return { appName, durationSeconds, time };
      })
      .filter((entry: { appName: string; durationSeconds: number; time: string | null }) => {
        if (!entry.appName || entry.durationSeconds <= 0) return false;
        // Filter out system/OS entries
        const lower = entry.appName.toLowerCase();
        const systemPatterns = [
          "screen locked", "screen on", "screen off", "screen timeout",
          "device idle", "phone locked", "device locked",
          "launcher", "home screen", "system ui", "systemui",
          "keyboard", "gboard", "swiftkey", "samsung keyboard",
          "one ui home", "pixel launcher", "nova launcher",
          "android system", "com.android", "status bar",
        ];
        if (systemPatterns.some(p => lower.includes(p))) return false;
        const key = `${lower}|${entry.time ?? ""}|${entry.durationSeconds}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    console.log(`Extracted ${entries.length} entries from screenshot`);

    return new Response(
      JSON.stringify({ entries }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Parse error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
