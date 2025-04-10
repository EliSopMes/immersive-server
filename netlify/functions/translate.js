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

    const response = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`
        },
        body: JSON.stringify({
            text: [text],
            target_lang: 'EN',
            source_lang: 'DE'
        })
    });

    const data = await response.json();

    if (data.translations && data.translations.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ translated: data.translations[0].text })
      }
    } else {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Translation failed." }),
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
