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

    let { data, error } = await supabaseUserClient
      .from("practice_requests")
      .select("practice_request_count")
      .eq("user_id", userId)
      .single();

    if (data) {
      await supabaseUserClient
        .from("practice_requests")
        .update({ practice_request_count: data.practice_request_count + 1 })
        .eq("user_id", userId)
    } else {
      await supabaseUserClient
        .from("practice_requests")
        .insert({ id: userId, practice_request_count: 1 });
    }

    if (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Upsert failed", details: error.message })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Practice request registered" }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
