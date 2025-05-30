import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); // Service role key — only on server

export async function handler(event, context) {
  const headers = {
    // "Access-Control-Allow-Origin": "chrome-extension://jjgoafkbaaomiieahjfcapkemokcehhb", // or set a specific domain instead of '*'
    "Access-Control-Allow-Origin": "*", // or set a specific domain instead of '*'
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers
    };
  }

  const jwt = event.headers.authorization?.replace("Bearer ", "");
  if (!jwt) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Missing or invalid token" })
    };
  }
  const supabaseUserClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY, // Only needed to decode the JWT
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } }
    }
  );

  const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

  if (userError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Invalid token or user not found" })
    };
  }

  const userId = user.id;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  let { data, error } = await supabase
    .from("rate_limits")
    .select("translate_count")
    .eq("user_id", userId)
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
      .update({ translate_count: data.translate_count + 1 })
      .eq("user_id", userId)
      .eq("date", today);
  } else {
    await supabase
      .from("rate_limits")
      .insert({ user_id: userId, date: today, translate_count: 1 });
  }

  try {
    const { text } = JSON.parse(event.body);

    const response = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`
        },
        body: JSON.stringify({
            text: [text],
            target_lang: 'EN',
            source_lang: 'DE'
        })
    });

    const data = await response.json();

    if (data.translations && data.translations.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ translated: data.translations[0].text })
      }
    } else {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Translation failed." }),
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
