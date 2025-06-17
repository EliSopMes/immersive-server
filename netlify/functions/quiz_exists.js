import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); // Service role key — only on server

export async function handler(event, context) {
  console.log("reached function")
  const headers = {
    "Access-Control-Allow-Origin": "*", // or set a specific domain instead of '*'
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };

  console.log(headers)

  if (event.httpMethod === "OPTIONS") {
    console.log("reached inside event.httpMethod")
    return {
      statusCode: 200,
      headers,
      body: "Preflight OK",
    };
  }

  console.log("reached before try")

  try {
    const jwt = event.headers.authorization?.replace("Bearer ", "");
    console.log(jwt)
    if (!jwt) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Missing or invalid token" })
      };
    }
    console.log("jwt exists")
    const supabaseUserClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON, // Only needed to decode the JWT
      {
        global: { headers: { Authorization: `Bearer ${jwt}` } }
      }
    );


    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    console.log(user)

    if (userError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Invalid token or user not found" })
      };
    }

    const userId = user.id;
    const { url } = JSON.parse(event.body);

    console.log(userId)
    console.log(url)

    let { data: existingQuiz, error: checkError } = await supabase
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

    if (!existingQuiz) {
      return {
        statusCode: 204, // No Content
        headers,
        body: JSON.stringify({ message: "No quiz found for this user/url" })
      };
    }

    console.log(existingQuiz)

    if (existingQuiz) {
      console.log("hey there")
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ quizId: existingQuiz.id })
      };
    }
  } catch (error) {
    console.log(error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
