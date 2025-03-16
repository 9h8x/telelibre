import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

// Define the Channel type
interface Channel {
  id: number;
  number: number;
  displayName: string | null;
  title: string | null;
  name: string | null;
  titles: any | null;
  logoUrl: string | null;
  contentUrls: any | null;
  imageUrl: string | null;
  logoPublicUrl: string | null;
  epgUrl: string | null;
}

// Define the EPG item type
interface EPGItem {
  id: number;
  title: string;
  startTime: string;
  endTime: string;
  description: string;
  pgRating: { name: string };
  imageUrl: string;
  state: string;
  // Add other fields as needed
}

// Define the channels_epg type
interface ChannelEPG {
  channel_id: number;
  epg_data: EPGItem[];
  epg_source: string | null;
  updated_at: string;
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format")?.toLowerCase() || "json";

    // Initialize Supabase client
    // Environment variables should be set for both production and development
    const supabaseUrl = import.meta.env.PROD
      ? locals.runtime.env.SUPABASE_URL
      : import.meta.env.SUPABASE_URL;

    const supabaseKey = import.meta.env.PROD
      ? locals.runtime.env.SUPABASE_ANON_KEY
      : import.meta.env.SUPABASE_ANON_KEY;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query all channels from the database
    const { data: channels, error: channelsError } = await supabase
      .from("channels")
      .select("*")
      .order("number", { ascending: true });

    if (channelsError) {
      throw new Error(`Error fetching channels: ${channelsError.message}`);
    }

    // Query EPG data for all channels
    const { data: epgData, error: epgError } = await supabase
      .from("channels_epg")
      .select("*");

    if (epgError) {
      throw new Error(`Error fetching EPG data: ${epgError.message}`);
    }

    // Create a map of channel ID to EPG data
    const epgMap = new Map<
      number,
      { data: EPGItem[]; source: string | null }
    >();
    epgData.forEach((item: ChannelEPG) => {
      epgMap.set(item.channel_id, {
        data: item.epg_data,
        source: item.epg_source,
      });
    });

    // Combine channel data with EPG data
    const channelsWithEPG = channels.map((channel) => {
      const epgInfo = epgMap.get(channel.id);
      return {
        ...channel,
        imageUrl: channel.logoPublicUrl,
        epg: epgInfo?.data || [],
        epgSource: epgInfo?.source || null,
      };
    });

    // Calculate statistics
    const sourceStats = {};
    let channelsWithValidEpg = 0;

    channelsWithEPG.forEach((channel) => {
      if (channel.epgSource && channel.epg && channel.epg.length > 0) {
        sourceStats[channel.epgSource] =
          (sourceStats[channel.epgSource] || 0) + 1;
        channelsWithValidEpg++;
      }
    });

    // Return the data in the requested format
    if (format === "xmltv") {
      const xmltv = convertToXMLTV(channelsWithEPG);
      return new Response(xmltv, {
        status: 200,
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        },
      });
    } else {
      // Return as JSON (default)
      return new Response(
        JSON.stringify({
          channels: channelsWithEPG,
          meta: {
            sourceStats,
            totalChannels: channels.length,
            channelsWithEpg: channelsWithValidEpg,
            lastUpdated: new Date().toISOString(),
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600", // Cache for 1 hour
          },
        }
      );
    }
  } catch (error) {
    console.error("Error in EPG endpoint:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};

/**
 * Convert channel and EPG data to XMLTV format
 * @param channelsWithEPG Array of channels with their EPG data
 * @returns XMLTV formatted string
 */
function convertToXMLTV(channelsWithEPG) {
  const formatDate = (isoString) => {
    // Convert ISO date to XMLTV format (yyyyMMddHHmmss +0000)
    const date = new Date(isoString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");

    return `${year}${month}${day}${hours}${minutes}${seconds} +0000`;
  };

  const escapeXML = (str) => {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  // Start building the XMLTV document
  let xmltv = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xmltv += '<!DOCTYPE tv SYSTEM "xmltv.dtd">\n';
  xmltv +=
    '<tv generator-info-name="EPG Converter" generator-info-url="https://example.com">\n';

  // Add channel information for all channels
  channelsWithEPG.forEach((channel) => {
    xmltv += `  <channel id="${channel.id}">\n`;

    // Use displayName if available, otherwise fall back to title or name
    const displayName =
      channel.displayName ||
      channel.title ||
      channel.name ||
      `Channel ${channel.number}`;
    xmltv += `    <display-name>${escapeXML(displayName)}</display-name>\n`;

    // Add channel number as a secondary display-name
    if (channel.number) {
      xmltv += `    <display-name>${channel.number}</display-name>\n`;
    }

    // Add channel logo if available
    if (channel.logoPublicUrl) {
      xmltv += `    <icon src="${escapeXML(channel.logoPublicUrl)}" />\n`;
    }

    xmltv += `  </channel>\n`;
  });

  // Add programme information for all channels
  channelsWithEPG.forEach((channel) => {
    if (channel.epg && Array.isArray(channel.epg) && channel.epg.length > 0) {
      channel.epg.forEach((programme) => {
        if (programme.startTime && programme.endTime) {
          xmltv += `  <programme start="${formatDate(
            programme.startTime
          )}" stop="${formatDate(programme.endTime)}" channel="${
            channel.id
          }">\n`;

          // Add title
          xmltv += `    <title lang="es">${escapeXML(
            programme.title
          )}</title>\n`;

          // Add description if available
          if (programme.description) {
            xmltv += `    <desc lang="es">${escapeXML(
              programme.description
            )}</desc>\n`;
          }

          // Add rating if available
          if (programme.pgRating && programme.pgRating.name) {
            xmltv += `    <rating system="TV Parental Guidelines">\n`;
            xmltv += `      <value>${escapeXML(
              programme.pgRating.name
            )}</value>\n`;
            xmltv += `    </rating>\n`;
          }

          // Add image if available
          if (programme.imageUrl) {
            // Use the source URL that successfully provided the EPG data
            const baseUrl =
              channel.epgSource || "https://stv.supportinternet.com.ar";
            xmltv += `    <icon src="${baseUrl}${programme.imageUrl}" />\n`;
          }

          xmltv += `  </programme>\n`;
        }
      });
    }
  });

  // Close the TV tag
  xmltv += "</tv>";

  return xmltv;
}
