import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); // Service role key — only on server

export async function handler(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*", // or set a specific domain instead of '*'
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "Preflight OK",
    };
  }


  try {
    const jwt = event.headers.authorization?.replace("Bearer ", "");
    if (!jwt) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Missing or invalid token" })
      };
    }
    const supabaseUserClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON, // Only needed to decode the JWT
      {
        global: { headers: { Authorization: `Bearer ${jwt}` } }
      }
    );

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Invalid token or user not found" })
      };
    }

    const userId = user.id;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let { data, error } = await supabase
      .from("rate_limits")
      .select("simplify_count")
      .eq("user_id", userId)
      .eq("date", today)
      .single();

    if (error && error.code !== "PGRST116") {
      // Real error
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Rate check failed" }) };
    }

    if (data && data.simplify_count >= 50) {
      return { statusCode: 429, headers, body: JSON.stringify({ error: "Rate limit exceeded" }) };
    }

    if (data) {
      await supabase
        .from("rate_limits")
        .update({ simplify_count: data.simplify_count + 1 })
        .eq("user_id", userId)
        .eq("date", today);
    } else {
      await supabase
        .from("rate_limits")
        .insert({ user_id: userId, date: today, simplify_count: 1 });
    }
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
              "content": `You are a German-to-English dictionary assistant. Your task is to provide clear, beginner-friendly (${level} German level) information about the given German word.
              Your output must follow these formatting and content rules strictly:
              1. Always output ONLY a valid JSON object.
              2. Use double quotes for all keys and string values.
              3. Never return markdown, code blocks, backticks, or extra text.
              \n- JSON structure:
                \n    - \"meaning\": (string) a short, clear definition in German (max 15 words)
                \n    - \"translation\": (string) the English translation.
                \n    - \"word_type\": (string) the part of speech (e.g. \"Nomen\", \"Verb\", \"Adjektiv\").
                \n    - \"synonyms\": (array of strings) up to 2 synonyms. Omit this field if none exist. If "word_type" is "Nomen", include the article in the synonyms (e.g. "die Katze").
                \n    - \"examples\": (array of strings) two short example sentences in German using the word correctly.
                \n    - If \"word_type\" is \"Nomen\", also include:
                          - "article": (string) one of "der", "die", "das"
                          - "plural": (string) the plural form
                \n    - If \"word_type\" is \"Verb\", also include:
                          - "infinitive": (string) the infinitive form
                \n\nImportant: Do not include any explanation, formatting, or extra characters. Only return a raw JSON object with the above structure.`
            },
            {
              "role": "user",
              "content": `Gib mir die Informationen zu folgendem Wort: ${text}`
            }
          ],
          max_tokens: 300,
          temperature: 0.3
        })
    });

    const openaiData = await response.json();
    const rawContent = openaiData.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new Error("No content returned from OpenAI");
    }

    const cleanedContent = rawContent.trim().replace(/^```json\s*|\s*```$/g, "");

    let simplified;
    try {
      simplified = JSON.parse(cleanedContent);
    } catch (jsonError) {
      console.error("JSON parse error:", jsonError.message);
      console.error("Raw OpenAI content:", rawContent);
      console.error("Cleaned content:", cleanedContent);

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Invalid JSON returned by OpenAI",
          details: jsonError.message,
          raw: cleanedContent,
        }),
      };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ simplified })
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
