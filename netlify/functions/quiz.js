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
    const { url, quizId } = JSON.parse(event.body);

    let { existingQuestions, checkError } = await supabase
      .from("questions")
      .select("id")
      .eq("quiz_id", quizId)
      .limit(1);

    if (checkError) {
      console.log(checkError)
      // Real error
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Failed to check existing questions", details: checkError })
      };
    }

    if (existingQuestions && existingQuestions.length > 0) {
      console.log("hey there")
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id, question, correct_answer, answers(answer_text, index)")
        .eq("quiz_id", quizId);

      if (questionsError) {
        console.log(questionsError)
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Failed to fetch questions", details: questionsError })
        };
      }
      console.log("hey?", questions)

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ questions, quizId })
      }
    } else {
      console.log("reached the AI generating part")
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
              "content": `You are a multiple choice comprehension quiz generator. Your task is to generate exactly **5 multiple choice questions** in **German** with **4 possible answers each** based on a provided URL.
              Your output must follow these formatting and content rules strictly:
              1. Always output ONLY a valid JSON object.
              2. Use double quotes for all keys and string values.
              3. Never return markdown, code blocks, backticks, or extra text.
              \n- JSON structure:
                \n    - \"meaning\": (string) a short, clear definition in German (max 15 words)
              Your output should be a JSON array of objects, with each object containing the following fields: \
              \n- \"title\": (string) the exact title of the page from the provded URL.
              \n- \"question\": (string) a clear and relevant multiple-choice question in German. \
              \n- \"choices\": (array of 4 strings) the 4 possible answers in German.
              \n- \"answer\": (integer) the index (0, 1, 2, or 3) of the correct answer within the array of choices.
              \n\nImportant: Do not include any explanation, formatting, or extra characters. Only return a raw JSON object with the above structure.`
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
      const content = openaiData.choices[0].message.content
      console.log(content)
      const cleanedContent = content.trim().replace(/^```json\s*|\s*```$/g, "");
      try {
        const questions = JSON.parse(cleanedContent)
        console.log(questions)
        const quizTitle = questions[0]?.title || 'Untitled'
        console.log(quizTitle)
      } catch (parseError) {
        console.error("❌ Failed to parse OpenAI response:", parseError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Invalid JSON from OpenAI", details: parseError.message })
        };
      }

      const { data, error: quizError } = await supabase
        .from("quizzes")
        .update({ title: quizTitle })
        .eq("id", quizId)
        .eq("user_id", userId)
        .select();

      if (quizError) {
        console.log(quizError)
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Failed to update quiztitle", details: quizError })
        };
      }

      if (!data || data.length === 0) {
        console.warn("No matching quiz found to update.");
      }

      for (const q of questions) {
        const { question, choices, answer } = q;
        console.log(question)
        console.log(choices)
        console.log(answer)

        const { data: questionData, error: questionError } = await supabase
          .from("questions")
          .insert({
            quiz_id: quizId,
            question,
            correct_answer: answer
          })
          .select()
          .single();

        if (questionError) {
          console.log(questionError)

          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Failed to insert question", details: questionError })
          };
        }

        const questionId = questionData.id;

        const answerPayload = choices.map((text, index) => ({
          question_id: questionId,
          answer_text: text,
          index
        }));

        const { error:  answersError } = await supabase.from("answers").insert(answerPayload)
        if (answersError) {
          console.log(answersError)

          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Failed to insert answers", details: answersError })
          };
        }
      }

      console.log("everything should be fine")
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ questions })
      }
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
