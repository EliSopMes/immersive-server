import { createClient } from "@supabase/supabase-js";
// import jwtDecode from "jwt-decode";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); // Service role key — only on server

export async function handler(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*", // or set a specific domain instead of '*'
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
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
    const { url } = JSON.parse(event.body);

    let { existingQuiz, checkError } = await supabase
      .from("quizzes")
      .select("id")
      .eq("user_id", userId)
      .eq("url", url)
      .single();

    if (checkError) {
      console.log(checkError)
      // Real error
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Failed to check existing questions",
          details: checkError.message
        })
      };
    }

    if (existingQuiz) {
      console.log("hey there")
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ quizId: existingQuiz.id })
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
