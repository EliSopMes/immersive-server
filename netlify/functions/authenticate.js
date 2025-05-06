import { createClient } from "@supabase/supabase-js";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); // Service role key — only on server

export async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "Preflight OK",
    };
  }
  try {
    const { task, email, password } = JSON.parse(event.body || '{}');

    if (!task) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Task is required" }),
      };
    }

    if (task === 'logout') {
      const { error } = await supabase.auth.signOut()
      if (error) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: error.message })
        };
      }
    } else if (task === 'login') {
      if (!email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Email and password are required for login." }),
        };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: error.message }),
        };
      }

      const { session } = data;
      if (!session) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: "Authentication failed. No session returned." }),
        };
      }
      const { access_token, refresh_token, expires_at } = session;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          token: access_token,
          refreshToken: refresh_token,
          expiration: expires_at,
        }),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid task." }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
