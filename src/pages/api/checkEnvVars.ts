export function GET(context) {
  try {
    const { env } = context.locals.runtime;

    // Check if environment variables are defined in the Cloudflare runtime
    const envVarStatus = {
      SUPABASE_URL: env.SUPABASE_URL ? env.SUPABASE_URL.substring(0,3) : "undefined",
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY ? env.SUPABASE_ANON_KEY.substring(0,3) : "undefined",
      SITE_URL: env.SITE_URL ? env.SITE_URL : "undefined",
      AUTH_USERNAME: env.AUTH_USERNAME ? env.AUTH_USERNAME.substring(0,3) : "undefined",
      AUTH_PASSWORD: env.AUTH_PASSWORD ? env.AUTH_PASSWORD.substring(0,3) : "undefined",
      AUTH_TENANT_ID: env.AUTH_TENANT_ID ? env.AUTH_TENANT_ID.substring(0,3) : "undefined",
    };

    // Return the environment variable status as a response
    return new Response(
      JSON.stringify({
        message: "Environment variables status check (Cloudflare runtime)",
        envVarStatus: envVarStatus,
        contact: "Email: admin@telelibre.site | Discord: telelibre",
        success: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error checking environment variables:", error);

    // Handle errors
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to check environment variables",
        errorDetails: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
