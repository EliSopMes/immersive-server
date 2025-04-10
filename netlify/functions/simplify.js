export async function handler(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*", // or set a specific domain instead of '*'
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "Preflight OK",
    };
  }

  try {
    const { text } = JSON.parse(event.body);
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
              "content": "You are a German language tutor specializing on transforming complicated German words & sentences into A2 level."
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
