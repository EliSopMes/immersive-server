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
              "content": `You are a German-to-English dictionary assistant. Your task is to provide definitions and information for a provided German word suitable for students with ${level} level.
              Beware of compound words in German.
              Output ONLY a JSON object, use double quotes for all keys and all string values. Do not return markdown, code blocks, or any extra text.
              \n- Structure your output with the following fields:
                \n    - \"meaning\": (string) a short & clear definition of the word in German.
                \n    - \"translation\": (string) the translated word in English.
                \n    - \"word_type\": (string) part of speech (e.g. \"Nomen\", \"Verb\", \"Adjektiv\").
                \n    - \"synonyms\": (array of strings) Up to 2 synonyms for the provided word. If the \"word_type\" is \"Nomen\" include the appropriate article (e.g., \"der Hund\"). If no synonyms exist, omit this field.
                \n    - \"examples\": (array of strings) 2 short example sentences in German using the word correctly.
                \n    - If \"word_type\" is \"Nomen\", add \"article\": (string) with the value 'der', 'die', or 'das'. Otherwise, omit the \"article\" field completely.
                \n    - If \"word_type\" is \"Nomen\", add \"plural\": (string) with the plural version of the word. Otherwise, omit the \"plural\" field completely.
                \n    - If \"word_type\" is \"Verb\", add \"infinitive\": (string) with the value of the uninflected / infinitive form of that verb. Otherwise, omit the \"infinitive\" field completely.
                \n\nImportant: No explanations, no greetings, no notes. Only pure valid JSON.`
            },
            {
              "role": "user",
              "content": `Was ist die Definition von: ${text}. Gib nur die Definition zurück, ohne weitere Erklärungen`
            }
          ],
          max_tokens: 100,
          temperature: 0.5
        })
    });

    const openaiData = await response.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ simplified: openaiData.choices[0].message.content })
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
