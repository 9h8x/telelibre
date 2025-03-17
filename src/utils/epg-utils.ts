// Utility function to get the current show for a channel
export async function getCurrentShow(channelId: number, epgData?: any) {
  try {
    // If epgData is not provided, fetch it
    if (!epgData) {
      const SITE_URL = import.meta.env.PROD
        ? Astro?.locals?.runtime?.env?.SITE_URL
        : import.meta.env.SITE_URL;

      const response = await fetch(`http://localhost:4321/epg/all`);
      epgData = await response.json();
    }

    // Find the channel in the EPG data
    const channel = epgData.channels?.find((ch) => ch.id === channelId);

    if (!channel || !channel.epg || channel.epg.length === 0) {
      return null;
    }

    // Get current time in UTC
    const now = new Date();

    // Find the show that's currently playing
    const currentShow = channel.epg.find((show) => {
      const startTime = new Date(show.startTime);
      const endTime = new Date(show.endTime);

      return now >= startTime && now < endTime;
    });

    return currentShow || null;
  } catch (error) {
    console.error(
      `Error getting current show for channel ${channelId}:`,
      error
    );
    return null;
  }
}

// Format show time for display
export function formatShowTime(show) {
  if (!show || !show.startTime || !show.endTime) {
    return "";
  }

  const startTime = new Date(show.startTime);
  const endTime = new Date(show.endTime);

  const options = { hour: "numeric", minute: "2-digit", hour12: true };
  const formattedStart = startTime.toLocaleTimeString("es-AR", options);
  const formattedEnd = endTime.toLocaleTimeString("es-AR", options);

  return `${formattedStart} - ${formattedEnd}`;
}
