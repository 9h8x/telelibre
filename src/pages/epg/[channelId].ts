// File: src/pages/api/epg/[channelId].ts
import type { APIRoute } from "astro";

export async function GET({ request, params }) {
  try {
    // Extract the channel ID from the URL path
    const { channelId } = params;

    if (!channelId) {
      return new Response(JSON.stringify({ error: "Channel ID is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Optional: Extract tenant ID from query params (defaults to 1)
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") || "1";
    const format = url.searchParams.get("format")?.toLowerCase() || "json"; // Default to JSON if not specified

    // Create headers for the request
    const headers = {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      Origin: "https://stv.supportinternet.com.ar",
      Referer: "https://stv.supportinternet.com.ar/",
    };

    // Fetch EPG data for the specified channel
    const epgUrl = `https://stv.supportinternet.com.ar/sb/public/epg/channel/${channelId}?tenantId=${tenantId}`;
    const response = await fetch(epgUrl, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({
          error: "Failed to fetch EPG data",
          status: response.status,
          details: errorText,
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Parse the EPG data
    const epgData = await response.json();

    const filteredData = epgData
      .filter((item) => item.state !== "CATCHUP") // Filter out items with state "CATCHUP"
      .map((item) => {
        // Process each item here if needed
        return item; // You can transform the item if required
      });

    // Return the data in the requested format
    if (format === "xmltv") {
      const xmltv = convertToXMLTV(filteredData, channelId);
      return new Response(xmltv, {
        status: 200,
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        },
      });
    } else {
      // Return as JSON (default)
      return new Response(JSON.stringify(filteredData), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        },
      });
    }
  } catch (error) {
    console.error("Error fetching EPG data:", error);

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
}

/**
 * Convert EPG data to XMLTV format
 * @param data The filtered EPG data
 * @param channelId The channel ID
 * @returns XMLTV formatted string
 */
function convertToXMLTV(data, channelId) {
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

  // Add channel information
  xmltv += `  <channel id="${channelId}">\n`;
  xmltv += `    <display-name>${channelId}</display-name>\n`;
  xmltv += `  </channel>\n`;

  // Add programme information
  data.forEach((item) => {
    xmltv += `  <programme start="${formatDate(
      item.startTime
    )}" stop="${formatDate(item.endTime)}" channel="${channelId}">\n`;
    xmltv += `    <title lang="es">${escapeXML(item.title)}</title>\n`;

    if (item.description) {
      xmltv += `    <desc lang="es">${escapeXML(item.description)}</desc>\n`;
    }

    if (item.pgRating && item.pgRating.name) {
      xmltv += `    <rating system="TV Parental Guidelines">\n`;
      xmltv += `      <value>${escapeXML(item.pgRating.name)}</value>\n`;
      xmltv += `    </rating>\n`;
    }

    if (item.imageUrl) {
      xmltv += `    <icon src="https://stv.supportinternet.com.ar${item.imageUrl}" />\n`;
    }

    // Add category if you can determine it from the data
    // xmltv += `    <category lang="en">Category</category>\n`;

    xmltv += `  </programme>\n`;
  });

  // Close the TV tag
  xmltv += "</tv>";

  return xmltv;
}
