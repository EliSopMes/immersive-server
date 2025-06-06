import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON // Use ANON if calling refreshToken, not SERVICE_ROLE
)

export async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Replace * with your specific allowed origin in production
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: 'OK',
    }
  }


  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  const { refresh_token } = JSON.parse(event.body)
  console.log(refresh_token)

  if (!refresh_token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Refresh token is required' }),
    }
  }
  console.log("made it to before refreshSession")

  const { data, error } = await supabase.auth.refreshSession({ refresh_token })

  if (error) {
    console.log(error)
    return {
      statusCode: 401,
      body: JSON.stringify({ error: error.message }),
    }
  }

  console.log(data)
  // Store new session/token securely if needed (optional)

  return {
    statusCode: 200,
    body: JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    }),
  }
}
