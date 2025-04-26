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
              "content": `You are a German to English dictionairy specializing on translating given text whilst also providing information about the German text`
            },
            {
              "role": "user",
              "content": `Was ist die Übersetzung von diesem Wort: ${text}. Gib mir die Übersetzung,
               die Art von Wort und im Fall eines Nomens, den passenden Artikel zurück, ohne weitere Erklärungen in diesem Format:
               { translation: <Übersetzung>, word_type: <Art von Wort>, article: <Artikel>  }
               `
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
