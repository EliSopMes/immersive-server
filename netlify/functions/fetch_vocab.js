import { createClient } from "@supabase/supabase-js";

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
    console.log(userId)
    const oneWeek = new Date();
    console.log(oneWeek)
    const oneWeekAgo =  oneWeek.setDate(oneWeek.getDate() - 7);
    console.log(oneWeekAgo)
    const isoOneWeekAgo = oneWeekAgo.toString();
    console.log(isoOneWeekAgo)

    const { data, error } = await supabaseUserClient
      .from("saved_words")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", isoOneWeekAgo)
      .order("created_at", { ascending: false });

    if (error && error.code !== "PGRST116") {
      // Real error
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Word check failed" }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ saved_words: data }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
