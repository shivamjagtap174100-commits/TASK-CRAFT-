import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return respond({ error: "Sign in to use AI features." }, 401);
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 8192) return respond({ error: "Request is too large." }, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !geminiApiKey) {
    console.error("AI assistant configuration is incomplete.");
    return respond({ error: "The AI assistant is not configured. Set its Supabase and Gemini secrets." }, 503);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return respond({ error: "Your session is invalid or expired. Sign in again." }, 401);

  let input: { mode?: unknown; prompt?: unknown; context?: unknown };
  try {
    input = await request.json();
  } catch {
    return respond({ error: "Request body must be valid JSON." }, 400);
  }

  const mode = input.mode;
  const prompt = input.prompt;
  if (mode !== "roadmap" && mode !== "flashcards" && mode !== "chat") {
    return respond({ error: "Choose a supported AI mode." }, 400);
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1000) {
    return respond({ error: "Enter a prompt of 1–1000 characters." }, 400);
  }

  const context = input.context && typeof input.context === "object"
    ? JSON.stringify(input.context).slice(0, 2000)
    : "{}";
  const instructions = mode === "roadmap"
    ? `Create a practical learning roadmap for the user's topic. Current UTC date: ${new Date().toISOString().slice(0, 10)}. Return only valid JSON with this shape: {"title":"...","topic":"...","phases":[{"phase":1,"badge":"...","difficulty":"Beginner|Intermediate|Advanced","title":"...","duration":"...","objective":"...","prerequisites":["..."],"strategy":"...","tasks":[{"title":"...","priority":"low|medium|high","due_date":"YYYY-MM-DD","duration":"..."}],"tools":["..."]}]}. Include 4 to 6 phases, each with a useful strategy and 3 to 5 specific tasks. Give tasks realistic dates, durations, and priorities.`
    : mode === "flashcards"
    ? `Create 8 concise study flashcards for the user's topic. Return only valid JSON: [{"question":"...","answer":"..."}].`
    : `You are TaskCraft's concise, supportive study and project-planning assistant. Help the user use the planner or make practical progress. Workspace context: ${context}. Do not claim to have changed or synced data.`;

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${instructions}\n\nUser request: ${prompt.trim()}` }] }],
        generationConfig: { temperature: 0.5, ...(mode !== "chat" ? { responseMimeType: "application/json" } : {}) },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    console.error("Gemini request failed.", error);
    return respond({ error: "Could not reach the AI provider. Try again shortly." }, 502);
  }

  if (!upstream.ok) {
    console.error("Gemini returned an unsuccessful response.", upstream.status);
    return respond({ error: "The AI provider could not complete this request. Check the Gemini key, quota, and model configuration." }, 502);
  }

  let result: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  try {
    result = await upstream.json();
  } catch {
    console.error("Gemini returned a non-JSON response.");
    return respond({ error: "The AI provider returned an unreadable response." }, 502);
  }
  const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) return respond({ error: "The AI provider returned an empty response. Please try again." }, 502);

  return respond({ text });
});
