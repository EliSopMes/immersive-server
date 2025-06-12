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
        body: JSON.stringify({
          error: "Failed to check existing questions",
          details: checkError.message
        })
      };
    }

    if (existingQuestions && existingQuestions.length > 0) {
      console.log("hey there")
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ quizId: quizId })
      };
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
              "content": `
              You are a JSON API that generates 5 multiple-choice comprehension questions in German. Return ONLY a valid JSON array.

              Each item in the array must be an object with the following keys:
              - "title": string (title of the provided article)
              - "question": string (in German)
              - "choices": array of 4 strings (in German)
              - "answer": integer (index of correct choice, 0–3)

              Output rules:
              - Output ONLY valid JSON — no markdown, no explanations, no comments, no code blocks.
              - Use double quotes for all keys and strings.
              - Do NOT include escape characters or trailing commas.
              - Do NOT include any text before or after the JSON array.
              `
            },
            {
              "role": "user",
              "content": `Was sind 5 Verständnisfragen (Multiple Choice) für diesen Text: ${url}?`
            }
          ],
          max_tokens: 1500,
          temperature: 0.5
        })
      });
      const openaiData = await response.json();
      const content = openaiData.choices[0].message.content
      const cleanedContent = content.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
      console.log(cleanedContent)
      // const cleanedContent = content.trim().replace(/^```json\s*|\s*```$/g, "");
      try {
        const questions = JSON.parse(cleanedContent)
        const quizTitle = questions[0]?.title || 'Untitled'
        console.log(quizTitle)

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
      } catch (parseError) {
        console.error("❌ Failed to parse OpenAI response:", parseError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: "Invalid JSON from OpenAI",
            details: parseError.message,
            original: content
          })
        };
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
