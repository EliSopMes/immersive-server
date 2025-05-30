import { createClient } from "@supabase/supabase-js";
// import jwtDecode from "jwt-decode";

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
    // const supabaseUserClient = createClient(
    //   process.env.SUPABASE_URL,
    //   process.env.SUPABASE_ANON, // Only needed to decode the JWT
    //   {
    //     global: { headers: { Authorization: `Bearer ${jwt}` } }
    //   }
    // );

    // const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    // if (userError || !user) {
    //   return {
    //     statusCode: 401,
    //     headers,
    //     body: JSON.stringify({ error: "Invalid token or user not found" })
    //   };
    // }

    // const userId = user.id;
    // const { sub: userId } = jwtDecode(jwt);
    const { url } = JSON.parse(event.body);

    let { data, error } = await supabase
      .from("quizzes")
      .select("*")
      .eq("user_id", userId)
      .eq("url", url)
      .single();

    if (error && error.code !== "PGRST116") {
      // Real error
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Database query failed" }) };
    }

    if (data) {
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id, question, correct_answer, answers(answer_text, index)")
        .eq("quiz_id", data.id);

      if (questionsError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Failed to fetch questions" })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ questions })
      }
    } else {
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
              "content": `You are a multiple choice comprehension quiz generator. Based on a provided URL, generate exactly
              **5 multiple choice questions** in **German** with **4 possible answers each**.
              Your output should be a JSON array of objects, with each object containing the following fields: \
              \n- \"question\": (string) a clear and relevant multiple-choice question in German. \
              \n- \"choices\": (array of 4 strings) the 4 possible answers in German.
              \n- \"answer\": (integer) the index (0, 1, 2, or 3) of the correct answer within the array of choices.
              \n\nOnly output the JSON array—no markdown, no code blocks, and no extra text. Format all keys and string values
              with double quotes, and make sure the JSON is valid.`
            },
            {
              "role": "user",
              "content": `Was sind 5 Verständnisfragen (Multiple Choice) für diesen Text: ${url}?`
            }
          ],
          max_tokens: 100,
          temperature: 0.5
        })
      });
      const openaiData = await response.json();
      const questions = JSON.parse(openaiData.choices[0].message.content)
    }
    const { data: quizData, error: quizError } = await supabase
      .from("quizzes")
      .insert({ user_id: userId, url })
      .select()
      .single();

    if (quizError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Failed to insert quiz" })
      };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ questions })
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
