import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); // Service role key — only on server

export async function handler(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*", // or set a specific domain instead of '*'
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "Preflight OK",
    };
  }

  const ip = event.headers["x-forwarded-for"] || "unknown-ip"; // fallback if IP missing
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  let { data, error } = await supabase
    .from("rate_limits")
    .select("translate_count")
    .eq("identifier", ip)
    .eq("date", today)
    .single();

  if (error && error.code !== "PGRST116") {
    // Real error
    return { statusCode: 500, body: JSON.stringify({ error: "Rate check failed" }) };
  }

  if (data && data.translate_count >= 50) {
    return { statusCode: 429, body: JSON.stringify({ error: "Rate limit exceeded" }) };
  }

  if (data) {
    await supabase
      .from("rate_limits")
      .update({ simplify_count: data.simplify_count + 1 })
      .eq("identifier", ip)
      .eq("date", today);
  } else {
    await supabase
      .from("rate_limits")
      .insert({ identifier: ip, date: today });
  }

  try {
    const { text, level } = JSON.parse(event.body);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          "messages": [
            {
              "role": "system",
              "content": `You are a German-to-English dictionary assistant. Your task is to translate the provided German text into English.
              Always strictly output a valid JSON object with double quotes around both keys and string values,
              with no text before or after. Follow these rules exactly:
              \n\n- Output ONLY a JSON object, nothing else (no markdown, no code blocks, no backticks).
              \n- Fields for a single word:
                \n    - \"translation\": (string) the English translation.
                \n    - \"word_type\": (string) part of speech (e.g., noun, verb, adjective, etc.).
                \n    - If \"word_type\" is \"noun\", add \"article\": (string) with the value 'der', 'die', or 'das'. Otherwise, omit the \"article\" field completely.
                \n- Fields for multiple words:
                \n    - - \"translation\": (string) the English translation.
                \n\nImportant: No explanations, no greetings, no notes. Only pure valid JSON.`
            },
            {
              "role": "user",
              "content": `Was ist die Übersetzung von diesem Text: ${text}.`
            }
          ],
          max_tokens: 100,
          temperature: 0.5
        })
    });

    const data = await response.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ translated: data.choices[0].message.content })
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
