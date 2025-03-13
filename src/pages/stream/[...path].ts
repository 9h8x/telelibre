export async function GET({ params, request }) {
  try {
    const originalPath = params.path
    const originalUrl = `https://broker.cdn.rcs.net.ar/${originalPath}`;

    // Fetch the original stream
    const response = await fetch(originalUrl);

    if (!response.ok) {
      return new Response(`Error fetching stream: ${response.statusText}`, {
        status: response.status,
      });
    }

    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("Content-Type") || "application/octet-stream");
    headers.set("Content-Length", response.headers.get("Content-Length") || "");

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("Error proxying stream:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
