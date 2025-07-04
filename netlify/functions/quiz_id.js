import { createClient } from "@supabase/supabase-js";
// import jwtDecode from "jwt-decode";

// const { createClient } = require("@supabase/supabase-js");
// const jwtDecode = require("jwt-decode");


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
    console.log(userId)
    // const { sub: userId } = jwtDecode(jwt);
    const { url } = JSON.parse(event.body);
    console.log(url)

    const { data: quizData, error: quizError } = await supabase
      .from("quizzes")
      .insert({ user_id: userId, url })
      .select()
      .single();

    if (quizError || !quizData || !quizData.id) {
      console.log(quizError)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Failed to create quiz entry", quizError })
      };
    }

    console.log(quizData)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ quiz_id: quizData.id })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
