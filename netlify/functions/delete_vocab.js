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
    const { original_word } = JSON.parse(event.body);

    const { error: deleteError } = await supabase
      .from("saved_words")
      .delete()
      .eq("original_word", original_word)
      .eq("user_id", userId);


    if (deleteError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: deleteError.message }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Word saved" }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
