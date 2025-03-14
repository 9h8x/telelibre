export async function GET(context) {
    try {
      // Return the environment variable status as a response
      return new Response(
        JSON.stringify({
          message: "Ping",
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