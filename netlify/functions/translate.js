export async function handler(event, context) {
  // Retrieve API key
  const { text } = JSON.parse(event.body);

  // Make API call to DeepL
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
      body: JSON.stringify({ translated: data.translations[0].text })
    }
  } else {
      throw new Error('Translation failed');
  }
}
