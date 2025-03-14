export function GET(context) {
  try {
    const { env } = context.locals.runtime;

    // Check if environment variables are defined in the Cloudflare runtime
    const envVarStatus = {
      SUPABASE_URL: env.SUPABASE_URL ? "defined" : "undefined",
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY ? "defined" : "undefined",
      SITE_URL: env.SITE_URL ? "defined" : "undefined",
      AUTH_USERNAME: env.AUTH_USERNAME ? "defined" : "undefined",
      AUTH_PASSWORD: env.AUTH_PASSWORD ? "defined" : "undefined",
      AUTH_TENANT_ID: env.AUTH_TENANT_ID ? "defined" : "undefined",
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
