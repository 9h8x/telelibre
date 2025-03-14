import { createClient } from "@supabase/supabase-js";

const SITE_URL = import.meta.env.SITE_URL;

// Initialize Supabase client
const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET({ request }) {
  try {
    // Fetch data directly from Supabase instead of API endpoint
    const { data: channels, error } = await supabase
      .from("channels")
      .select("*");

    if (error) throw error;

    // Build the M3U playlist
    let m3uPlaylist = "#EXTM3U\n";

    channels.forEach((channel) => {
      const displayName = channel.displayName || "Unknown Channel";
      const hlsUrl = channel.contentUrls.hlsFP;

      // Use the public URL from Supabase Storage if available, otherwise fall back to the API endpoint
      const logoUrl = channel.logoPublicUrl || `${SITE_URL}${channel.logoUrl}`;

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
    console.error("Error generating M3U playlist:", error);

    // Handle errors
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
