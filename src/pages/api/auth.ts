export const prerender = false

export async function POST({ request }) {
  try {
    // Parse the request body to extract username, password, and tenantId
    const { username, password, tenantId } = await request.json();

    if (!username || !password || !tenantId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: username, password, or tenantId",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Set up headers for the login request
    const myHeaders = new Headers();
    myHeaders.append("Accept", "application/json");
    myHeaders.append(
      "Accept-Language",
      "es-AR,es-US;q=0.9,es-419;q=0.8,es;q=0.7"
    );
    myHeaders.append("Access-Control-Allow-Headers", "*");
    myHeaders.append("Connection", "keep-alive");
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");
    myHeaders.append("Origin", "https://stv.supportinternet.com.ar");
    myHeaders.append("Referer", "https://stv.supportinternet.com.ar/");
    myHeaders.append("Sec-Fetch-Dest", "empty");
    myHeaders.append("Sec-Fetch-Mode", "cors");
    myHeaders.append("Sec-Fetch-Site", "same-origin");
    myHeaders.append(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
    );
    myHeaders.append(
      "User-Agent-App",
      "Rocstar WEB/1.0.89 (Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36)"
    );

    // Prepare the request body
    const urlencoded = new URLSearchParams();
    urlencoded.append("username", username);
    urlencoded.append("password", password);
    urlencoded.append("tenantId", tenantId);

    // Send the login request
    const response = await fetch(
      "https://stv.supportinternet.com.ar/sb/login",
      {
        headers: myHeaders,
        body: urlencoded,
        redirect: "follow",
        method: "POST",
      }
    );

    // Handle successful login
    if (response.ok) {
      const xSessionId = response.headers.get("x-session-id");
      if (!xSessionId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing auth key in response headers",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          authKey: xSessionId,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Handle unsuccessful login
    const errorData = await response.json();
    return new Response(
      JSON.stringify({
        success: false,
        ...errorData,
      }),
      {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error during login:", error);

    // Handle unexpected errors
    return new Response(
      JSON.stringify({
        success: false,
        error: "An unexpected error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
