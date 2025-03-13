import { readFile } from 'fs/promises';

const SITE_URL = import.meta.env.SITE_URL; // Replace with your actual site URL

export async function GET({ request }) {
  try {
    // Read the JSON file
    const data = await fetch(`${SITE_URL}/api/canales`)

    // Parse the JSON data
    const parsedData = await data.json()

    // Extract the channels data
    const channels = parsedData.data;

    // Build the M3U playlist
    let m3uPlaylist = "#EXTM3U\n";

    channels.forEach((channel) => {
      const displayName = channel.displayName || "Unknown Channel";
      const hlsUrl = channel.contentUrls.hlsFP;
      const logoUrl = `${SITE_URL}${channel.logoUrl}`;

      m3uPlaylist += `#EXTINF:-1 tvg-logo="${logoUrl}",${displayName}\n${hlsUrl}\n`;
    });

    // Return the M3U playlist as a response
    return new Response(m3uPlaylist, {
      status: 200,
      headers: {
        "Content-Type": "audio/x-mpegurl",
        "Content-Disposition": 'attachment; filename="playlist.m3u"',
      },
    });
  } catch (error) {
    console.error('Error generating M3U playlist:', error);

    // Handle errors (e.g., file not found, invalid JSON)
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to generate M3U playlist",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
