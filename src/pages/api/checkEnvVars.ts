const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_ANON_KEY;
const siteurl = import.meta.env.SITE_URL;
const auth_username = import.meta.env.AUTH_USERNAME;
const auth_password = import.meta.env.AUTH_PASSWORD;
const auth_tenant_id = import.meta.env.AUTH_TENANT_ID;

export async function GET({ request }) {
  try {
    // Check if environment variables are defined
    const envVarStatus = {
      SUPABASE_URL: supabaseUrl ? "defined" : "undefined",
      SUPABASE_ANON_KEY: supabaseKey ? "defined" : "undefined",
      SITE_URL: siteurl ? "defined" : "undefined",
      AUTH_USERNAME: auth_username ? "defined" : "undefined",
      AUTH_PASSWORD: auth_password ? "defined" : "undefined",
      AUTH_TENANT_ID: auth_tenant_id ? "defined" : "undefined",
    };

    // Return the environment variable status as a response
    return new Response(
      JSON.stringify({
        message: "Environment variables status check",
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
