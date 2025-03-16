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

/**
 * Shuffles an array using Fisher-Yates algorithm
 * @param array The array to shuffle
 * @returns A new shuffled array
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Fetches data from a URL with retry logic
 * @param url The URL to fetch from
 * @param options Fetch options
 * @param maxRetries Maximum number of retry attempts
 * @param baseDelay Base delay between retries in ms
 * @returns The fetch response or throws an error
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 5,
  baseDelay: number = 300
): Promise<{ data: any; status: number }> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Set a timeout for each request (5 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      return { data, status: response.status };
    } catch (error) {
      lastError = error;
      console.error(
        `Attempt ${attempt + 1}/${maxRetries} failed for ${url}:`,
        error.message
      );

      // Don't delay on the last attempt
      if (attempt < maxRetries - 1) {
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) * (0.5 + Math.random());
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Fetches data from multiple base URLs in parallel
 * @param baseUrls Array of base URLs to fetch from
 * @param endpoint The endpoint to append to each base URL
 * @param options Optional fetch options
 * @param maxRetries Maximum number of retry attempts per URL
 * @returns Object with successful and failed responses
 */
async function fetchFromMultipleUrls(
  baseUrls: string[],
  endpoint: string,
  options: RequestInit = {},
  maxRetries: number = 5
) {
  // Add default headers if not provided
  const fetchOptions = {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      Origin: "https://stv.supportinternet.com.ar",
      Referer: "https://stv.supportinternet.com.ar/",
      ...options.headers,
    },
    ...options,
  };

  // Shuffle the base URLs for randomization
  const shuffledUrls = shuffleArray(baseUrls);

  // Create an array of promises for each fetch request
  const fetchPromises = shuffledUrls.map(async (baseUrl) => {
    const url = `${baseUrl}${endpoint}`;
    try {
      console.log(`Attempting to fetch from ${baseUrl}`);
      const { data, status } = await fetchWithRetry(
        url,
        fetchOptions,
        maxRetries
      );

      return { url: baseUrl, data, status };
    } catch (error) {
      console.error(`All retries failed for ${url}:`, error.message);
      return {
        url: baseUrl,
        error: error.message,
        status: error.name === "AbortError" ? "TIMEOUT" : "ERROR",
      };
    }
  });

  // Wait for all promises to resolve, including failures
  const results = await Promise.all(fetchPromises);

  // Filter out successful responses
  const successfulResponses = results.filter((result) => !result.error);

  // Log error statistics
  const failedResponses = results.filter((result) => result.error);
  if (failedResponses.length > 0) {
    console.log(`${failedResponses.length}/${baseUrls.length} requests failed`);
  }

  return {
    success: successfulResponses,
    failed: failedResponses,
    all: results,
  };
}

export async function GET({ request, locals }) {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format")?.toLowerCase() || "json";
    const tenantId = url.searchParams.get("tenantId") || "1";

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
    const { data: channels, error } = await supabase
      .from("channels")
      .select("*")
      .order("number", { ascending: true });

    if (error) {
      throw new Error(`Error fetching channels: ${error.message}`);
    }

    // Define the base URLs for fetching EPG data
    const baseUrls = [
      "https://ver.tele.com.ar",
      "https://stv.supportinternet.com.ar",
      "https://play.conectarservicios.com.ar",
      "https://tv.is.com.ar",
      "https://davitelplay.davitel.com.ar",
      "https://iptelplay.com.ar",
      "https://olatv.com.ar",
      "https://play.xg.ar",
    ];

    // Fetch EPG data for each channel
    const channelsWithEPG = await Promise.all(
      channels.map(async (channel: Channel) => {
        try {
          console.log(`Fetching EPG for channel ${channel.id}`);

          // Try to fetch EPG data from multiple sources
          const epgEndpoint = `/sb/public/epg/channel/${channel.id}?tenantId=${tenantId}`;
          const results = await fetchFromMultipleUrls(
            baseUrls,
            epgEndpoint,
            {},
            5
          );

          // Use the first successful response, or return empty EPG if all failed
          if (results.success.length > 0) {
            // Find the first response with valid EPG data (non-empty array)
            const validResponse = results.success.find(
              (response) =>
                Array.isArray(response.data) && response.data.length > 0
            );

            if (validResponse) {
              const epgData = validResponse.data;
              console.log(
                `Successfully fetched EPG for channel ${channel.id} from ${validResponse.url} (${epgData.length} programs)`
              );

              return {
                ...channel,
                imageUrl: channel.logoPublicUrl,
                epg: epgData,
                epgSource: validResponse.url,
              };
            }

            // If no valid EPG data found in successful responses
            console.log(
              `No valid EPG data found for channel ${channel.id} despite successful responses`
            );
            return {
              ...channel,
              imageUrl: channel.logoPublicUrl,
              epg: [],
              epgSource: null,
            };
          } else {
            console.error(
              `Failed to fetch EPG for channel ${channel.id} from all sources after retries`
            );
            return {
              ...channel,
              imageUrl: channel.logoPublicUrl,
              epg: [],
              epgSource: null,
            };
          }
        } catch (error) {
          console.error(`Error fetching EPG for channel ${channel.id}:`, error);
          return {
            ...channel,
            imageUrl: channel.logoPublicUrl,
            epg: [],
            epgSource: null,
          };
        }
      })
    );

    // Track which sources were used
    const sourceStats = baseUrls.reduce((acc, url) => {
      acc[url] = 0;
      return acc;
    }, {});

    // Count channels with valid EPG data
    let channelsWithValidEpg = 0;

    channelsWithEPG.forEach((channel) => {
      if (channel.epgSource && channel.epg) {
        sourceStats[channel.epgSource]++;
        channelsWithValidEpg++;
      }
    });

    console.log("EPG source statistics:", sourceStats);
    console.log(
      `Successfully fetched EPG for ${channelsWithValidEpg}/${channels.length} channels`
    );

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
    console.error("Error in EPG fetcher:", error);

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
