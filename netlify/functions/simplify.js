import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); // Service role key — only on server

export async function handler(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*", // or set a specific domain instead of '*'
    "Access-Control-Allow-Headers": "Content-Type", Authorization,
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "Preflight OK",
    };
  }

  // const ip = event.headers["x-forwarded-for"] || "unknown-ip"; // fallback if IP missing
  // const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

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
    .select("simplify_count")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  if (error && error.code !== "PGRST116") {
    // Real error
    return { statusCode: 500, body: JSON.stringify({ error: "Rate check failed" }) };
  }

  if (data && data.simplify_count >= 50) {
    return { statusCode: 429, body: JSON.stringify({ error: "Rate limit exceeded" }) };
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
              "content": `You are a German language tutor specializing on transforming complicated German words & sentences into ${level} level.`
            },
            {
              "role": "user",
              "content": `Was ist eine vereinfachte Version von diesem Text: ${text}. Gib nur die vereinfachte Version zurück, ohne weitere Erklärungen`
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
      body: JSON.stringify({ simplified: data.choices[0].message.content })
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
