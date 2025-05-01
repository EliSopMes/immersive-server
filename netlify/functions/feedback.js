import { createClient } from "@supabase/supabase-js";

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

    const userEmail = user.email;
    const { feedback } = JSON.parse(event.body);
    console.log(feedback)

    const webhookUrl = process.env.WEBHOOK_URL;
    const slackPayload = {
      channel: "#random",        // Optional if fixed in webhook settings
      username: "notifier",
      text: `Question / Feedback from: ${userEmail}\nMessage: ${feedback}`
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack notification failed: ${errorText}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Feedback sent" }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
