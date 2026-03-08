import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_CATEGORIES = [
  'work', 'coding', 'meetings', 'meals', 'exercise', 
  'sleep', 'leisure', 'social', 'commute', 'personal_care', 'break', 'other'
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, hasOngoingActivity, categoryCorrections, customCategories } = await req.json();
    
    // Input validation
    const MAX_MESSAGE_LENGTH = 500;
    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: "Message is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Message must be under ${MAX_MESSAGE_LENGTH} characters` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get current time in IST for reference
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    const currentTimeIST = istTime.toISOString().slice(11, 16); // HH:MM format
    const currentDateIST = istTime.toISOString().slice(0, 10); // YYYY-MM-DD format
    // Build category correction context from user's past edits
    let correctionContext = '';
    if (Array.isArray(categoryCorrections) && categoryCorrections.length > 0) {
      const examples = categoryCorrections
        .slice(-15)
        .map((c: { description: string; fromCategory: string; toCategory: string }) =>
          `"${c.description}" should be "${c.toCategory}" (NOT "${c.fromCategory}")`
        )
        .join('\n');
      correctionContext = `\n\nIMPORTANT - The user has corrected these categorizations in the past. Learn from them and apply similar logic:\n${examples}\n`;
    }

    // Build dynamic categories list including user's custom ones
    const customCats = Array.isArray(customCategories) ? customCategories : [];
    const ALL_CATEGORIES = [...BASE_CATEGORIES, ...customCats.map((c: { key: string }) => c.key)];
    const customCatDesc = customCats.length > 0
      ? '\n' + customCats.map((c: { key: string; label: string }) => `    - ${c.key}: ${c.label} (user-defined category)`).join('\n')
      : '';

    const systemPrompt = `You are a time tracking assistant. Your job is to parse natural language activity descriptions and extract structured data.

Current time in IST: ${currentTimeIST} on ${currentDateIST}
${correctionContext}

Given a user's message about what they're doing, determine:
1. **intent**: What action the user wants:
   - "start": User is beginning a new activity that will continue (e.g., "started coding", "beginning work")
   - "stop": User is ending their current activity without starting a new one (e.g., "stopped working", "done for today")
   - "switch": User is switching to a new activity, implicitly ending the previous one (e.g., "having dinner", "taking a break", "going to gym")

2. **description**: A clean, concise description of the activity (without timing words like "started", "stopped")

3. **category**: One of these categories:
   - work: General work tasks, office work
   - coding: Programming, development
   - meetings: Calls, meetings, video conferences
   - meals: Eating, food-related (breakfast, lunch, dinner, snacks, coffee)
   - exercise: Gym, running, sports, physical activity
   - sleep: Sleeping, napping
   - leisure: Entertainment, Netflix, gaming, reading for fun
   - social: Hanging out with friends, family time
   - commute: Travel, driving, transportation
   - personal_care: Shower, getting ready, self-care
   - break: Short breaks, rest
   - other: Anything that doesn't fit above${customCatDesc}

4. **startTime** (optional): If the user mentions a specific time (e.g., "at 2pm", "since 10:30", "from 9am"), convert it to ISO 8601 format in IST timezone. If no time is mentioned, set to null.

Context: ${hasOngoingActivity ? "User has an ongoing activity" : "User has no ongoing activity"}

Examples:
- "started coding" → intent: "start", description: "Coding", category: "coding", startTime: null
- "started coding at 2pm" → intent: "start", description: "Coding", category: "coding", startTime: "${currentDateIST}T14:00:00+05:30"
- "grabbing lunch" → intent: "switch", description: "Lunch", category: "meals", startTime: null
- "had lunch at 1:30" → intent: "switch", description: "Lunch", category: "meals", startTime: "${currentDateIST}T13:30:00+05:30"
- "stopped working at 6pm" → intent: "stop", description: "Work", category: "work", startTime: "${currentDateIST}T18:00:00+05:30"
- "gym session from 7am" → intent: "switch", description: "Gym workout", category: "exercise", startTime: "${currentDateIST}T07:00:00+05:30"

Respond ONLY with valid JSON, no other text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_activity",
              description: "Parse the user's activity message into structured data",
              parameters: {
                type: "object",
                properties: {
                  intent: { 
                    type: "string", 
                    enum: ["start", "stop", "switch"],
                    description: "The user's intent: start a trackable activity, stop current activity, or switch to a new activity"
                  },
                  description: { 
                    type: "string",
                    description: "A clean, concise description of the activity"
                  },
                  category: { 
                    type: "string", 
                    enum: CATEGORIES,
                    description: "The category of the activity"
                  },
                  startTime: {
                    type: ["string", "null"],
                    description: "ISO 8601 timestamp if user specified a time, null otherwise"
                  },
                },
                required: ["intent", "description", "category", "startTime"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_activity" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data));

    // Extract the function call arguments
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "parse_activity") {
      throw new Error("Invalid AI response format");
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    
    // Validate the response
    if (!parsed.intent || !parsed.description || !parsed.category) {
      throw new Error("Incomplete parsed data");
    }

    if (!CATEGORIES.includes(parsed.category)) {
      parsed.category = "other";
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error parsing activity:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to parse activity" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
