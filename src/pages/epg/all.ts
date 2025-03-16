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

// Track debugging information
interface DebugInfo {
  failedChannels: {
    id: number;
    name: string;
    attempts: number;
    lastError: string;
  }[];
  successfulFetches: Record<string, number>;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
}

// Global debug tracking
const debugInfo: DebugInfo = {
  failedChannels: [],
  successfulFetches: {},
  totalAttempts: 0,
  totalSuccesses: 0,
  totalFailures: 0,
};

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
 * Exhaustively tries to fetch EPG data for a channel using all available URLs
 * Will keep trying until successful or all options are exhausted
 * @param baseUrls Array of base URLs to try
 * @param endpoint The endpoint to append to each base URL
 * @param channelId The channel ID for debugging purposes
 * @param channelName The channel name for debugging purposes
 * @param options Fetch options
 * @returns The successful response or null if all attempts fail
 */
async function exhaustiveFetch(
  baseUrls: string[],
  endpoint: string,
  channelId: number,
  channelName: string,
  options: RequestInit = {}
): Promise<{ url: string; data: any } | null> {
  // Create a copy and shuffle the URLs to randomize the initial order
  const urlsToTry = shuffleArray([...baseUrls]);
  const triedUrls = new Set<string>();
  const maxAttemptsPerUrl = 5;
  let channelAttempts = 0;
  let lastError = "";

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

  let attemptCount = 0;
  const maxTotalAttempts = 150; // Increased from 100 to 150 for more attempts

  while (urlsToTry.length > 0 && attemptCount < maxTotalAttempts) {
    // Get the next URL to try
    const baseUrl = urlsToTry.shift();
    const fullUrl = `${baseUrl}${endpoint}`;
    let attemptsForThisUrl = 0;

    // Try this URL up to maxAttemptsPerUrl times
    while (attemptsForThisUrl < maxAttemptsPerUrl) {
      attemptCount++;
      attemptsForThisUrl++;
      channelAttempts++;
      debugInfo.totalAttempts++;

      try {
        console.log(
          `[Attempt ${attemptCount}] Trying ${baseUrl} for channel ${channelId} (${channelName}) (attempt ${attemptsForThisUrl}/${maxAttemptsPerUrl} for this URL)`
        );

        // Set a timeout for each request (6 seconds, increased from 5)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(fullUrl, {
          ...fetchOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.log(
            `[Attempt ${attemptCount}] HTTP error ${response.status} from ${baseUrl} for channel ${channelId}`
          );
          lastError = `HTTP error ${response.status} from ${baseUrl}`;

          // For HTTP errors, switch to next URL immediately on first attempt
          if (attemptsForThisUrl === 1) {
            console.log(
              `First attempt failed with HTTP error, switching to next URL`
            );
            break;
          }

          // Continue trying this URL unless we've reached the max attempts
          if (attemptsForThisUrl >= maxAttemptsPerUrl) {
            console.log(
              `Max attempts (${maxAttemptsPerUrl}) reached for ${baseUrl}, switching to next URL`
            );
            break;
          }

          // Wait before retry
          const delay =
            300 * Math.pow(1.5, attemptsForThisUrl) * (0.5 + Math.random());
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        const data = await response.json();

        // Check if we have valid EPG data
        if (Array.isArray(data) && data.length > 0) {
          console.log(
            `[SUCCESS] Found valid EPG data from ${baseUrl} for channel ${channelId} (${data.length} programs)`
          );

          // Track successful fetch
          debugInfo.successfulFetches[baseUrl] =
            (debugInfo.successfulFetches[baseUrl] || 0) + 1;
          debugInfo.totalSuccesses++;

          return { url: baseUrl, data };
        } else if (Array.isArray(data) && data.length === 0) {
          console.log(
            `[EMPTY] Response from ${baseUrl} for channel ${channelId} contained empty EPG data array`
          );
          lastError = `Empty EPG data array from ${baseUrl}`;

          // Empty array is technically valid, but we'll try another source
          if (attemptsForThisUrl === 1) {
            console.log(
              `First attempt returned empty data, switching to next URL`
            );
            break;
          }

          // If we've reached max attempts for this URL, move to the next one
          if (attemptsForThisUrl >= maxAttemptsPerUrl) {
            console.log(
              `Max attempts (${maxAttemptsPerUrl}) reached for ${baseUrl}, switching to next URL`
            );
            break;
          }

          // Wait before retry
          const delay =
            300 * Math.pow(1.5, attemptsForThisUrl) * (0.5 + Math.random());
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        } else {
          console.log(
            `[INVALID] Response from ${baseUrl} for channel ${channelId} contained invalid data format`
          );
          lastError = `Invalid data format from ${baseUrl}`;

          // Invalid data, switch to next URL immediately
          break;
        }
      } catch (error) {
        console.error(
          `[Attempt ${attemptCount}] Error from ${baseUrl} for channel ${channelId}:`,
          error.message
        );
        lastError = `Error: ${error.message} from ${baseUrl}`;

        // For network/timeout errors, switch to next URL immediately on first attempt
        if (attemptsForThisUrl === 1) {
          console.log(`First attempt failed with error, switching to next URL`);
          break;
        }

        // If we've reached max attempts for this URL, move to the next one
        if (attemptsForThisUrl >= maxAttemptsPerUrl) {
          console.log(
            `Max attempts (${maxAttemptsPerUrl}) reached for ${baseUrl}, switching to next URL`
          );
          break;
        }

        // Wait before retry
        const delay =
          300 * Math.pow(1.5, attemptsForThisUrl) * (0.5 + Math.random());
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Mark this URL as tried
    triedUrls.add(baseUrl);

    // If we've exhausted all URLs but still have no data, add all URLs back to the queue
    // This implements unlimited retries across all sources
    if (urlsToTry.length === 0 && triedUrls.size === baseUrls.length) {
      console.log(
        `[RETRY ALL] Exhausted all URLs for channel ${channelId}, starting over with all URLs`
      );

      // Get all URLs that aren't currently in the queue
      const urlsToReadd = baseUrls.filter((url) => !urlsToTry.includes(url));

      // Shuffle them and add back to queue
      const reshuffled = shuffleArray(urlsToReadd);
      urlsToTry.push(...reshuffled);

      // Clear the tried set for the next round
      triedUrls.clear();
    }
  }

  // If we get here, we've exhausted all options
  console.error(
    `[FAILED] Could not fetch data for channel ${channelId} after ${attemptCount} total attempts across all URLs`
  );

  // Track failed channel
  debugInfo.failedChannels.push({
    id: channelId,
    name: channelName,
    attempts: channelAttempts,
    lastError,
  });
  debugInfo.totalFailures++;

  return null;
}

/**
 * Generate a fallback EPG entry for a channel that failed to fetch data
 * @param channelId The channel ID
 * @returns A minimal EPG entry with current date
 */
function generateFallbackEPG(channelId: number): EPGItem[] {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return [
    {
      id: 0,
      title: "Programación no disponible",
      startTime: now.toISOString(),
      endTime: tomorrow.toISOString(),
      description:
        "La programación para este canal no está disponible en este momento.",
      pgRating: { name: "ATP" },
      imageUrl: "",
      state: "scheduled",
    },
  ];
}

export async function GET({ request, locals }) {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format")?.toLowerCase() || "json";
    const tenantId = url.searchParams.get("tenantId") || "1";
    const debug = url.searchParams.get("debug") === "true";

    // Initialize Supabase client
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
      "http://tv.netium.com.ar",
      "https://clicktv.com.ar",
      "https://tv.quilik.com.ar"
      // Add more fallback URLs if needed
    ];

    // Reset debugging information
    debugInfo.failedChannels = [];
    debugInfo.successfulFetches = {};
    debugInfo.totalAttempts = 0;
    debugInfo.totalSuccesses = 0;
    debugInfo.totalFailures = 0;

    // Fetch EPG data for each channel with unlimited retries
    const channelsWithEPG = await Promise.all(
      channels.map(async (channel: Channel) => {
        try {
          console.log(
            `\n========== CHANNEL ${channel.id} (${
              channel.displayName || channel.name || channel.number
            }) ==========`
          );

          const channelName =
            channel.displayName || channel.name || `Channel ${channel.number}`;

          // Try to fetch EPG data using our exhaustive fetch method
          const epgEndpoint = `/sb/public/epg/channel/${channel.id}?tenantId=${tenantId}`;
          const result = await exhaustiveFetch(
            baseUrls,
            epgEndpoint,
            channel.id,
            channelName
          );

          if (result) {
            console.log(
              `✅ Successfully fetched EPG for channel ${channel.id} from ${result.url}`
            );

            return {
              ...channel,
              imageUrl: channel.logoPublicUrl,
              epg: result.data,
              epgSource: result.url,
            };
          } else {
            console.error(
              `❌ Failed to fetch EPG for channel ${channel.id} after exhausting all options`
            );

            // Generate fallback EPG data
            const fallbackEpg = generateFallbackEPG(channel.id);

            return {
              ...channel,
              imageUrl: channel.logoPublicUrl,
              epg: fallbackEpg,
              epgSource: "fallback",
            };
          }
        } catch (error) {
          console.error(
            `❌ Unexpected error fetching EPG for channel ${channel.id}:`,
            error
          );

          // Generate fallback EPG data
          const fallbackEpg = generateFallbackEPG(channel.id);

          return {
            ...channel,
            imageUrl: channel.logoPublicUrl,
            epg: fallbackEpg,
            epgSource: "fallback",
          };
        }
      })
    );

    // Track which sources were used
    const sourceStats = baseUrls.reduce((acc, url) => {
      acc[url] = 0;
      return acc;
    }, {});

    // Add fallback to sourceStats
    sourceStats["fallback"] = 0;

    // Count channels with valid EPG data
    // Count channels with valid EPG data
    let channelsWithValidEpg = 0;
    let channelsWithFallbackEpg = 0;

    channelsWithEPG.forEach((channel) => {
      if (channel.epgSource && channel.epg && channel.epg.length > 0) {
        sourceStats[channel.epgSource]++;

        if (channel.epgSource === "fallback") {
          channelsWithFallbackEpg++;
        } else {
          channelsWithValidEpg++;
        }
      }
    });

    // All channels now have at least fallback EPG
    const totalValidChannels = channelsWithValidEpg + channelsWithFallbackEpg;

    console.log("\n========== SUMMARY ==========");
    console.log("EPG source statistics:", sourceStats);
    console.log(
      `Successfully fetched EPG for ${channelsWithValidEpg}/${
        channels.length
      } channels (${((channelsWithValidEpg / channels.length) * 100).toFixed(
        1
      )}%)`
    );
    console.log(`Fallback EPG added for ${channelsWithFallbackEpg} channels`);
    console.log(
      `Total channels with EPG data: ${totalValidChannels}/${
        channels.length
      } (${((totalValidChannels / channels.length) * 100).toFixed(1)}%)`
    );

    // Create detailed summary with debugging information
    let debugSummary = "";
    if (debugInfo.failedChannels.length > 0) {
      debugSummary =
        `\nFailed channels (${debugInfo.failedChannels.length}): ` +
        debugInfo.failedChannels
          .map(
            (c) =>
              `ID ${c.id} (${c.name}): ${c.lastError} after ${c.attempts} attempts`
          )
          .join("; ");
    }

    // Create the main summary string
    const summaryString = `Successfully fetched EPG for ${channelsWithValidEpg}/${
      channels.length
    } channels (${((channelsWithValidEpg / channels.length) * 100).toFixed(
      1
    )}%) + ${channelsWithFallbackEpg} fallback entries = ${totalValidChannels}/${
      channels.length
    } total (${((totalValidChannels / channels.length) * 100).toFixed(
      1
    )}%) - ${JSON.stringify(sourceStats)}${debugSummary}`;

    // Return the data in the requested format
    if (format === "xmltv") {
      const xmltv = convertToXMLTV(channelsWithEPG, summaryString);
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
            channelsWithValidEpg,
            channelsWithFallbackEpg,
            totalValidChannels,
            successRate: `${(
              (channelsWithValidEpg / channels.length) *
              100
            ).toFixed(1)}%`,
            totalRate: `${(
              (totalValidChannels / channels.length) *
              100
            ).toFixed(1)}%`,
            debug: debug ? debugInfo : undefined,
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
 * @param summaryString Summary string to include in the note tag
 * @returns XMLTV formatted string
 */
function convertToXMLTV(channelsWithEPG, summaryString) {
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
    if (channel.epg && Array.isArray(channel.epg)) {
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
          if (programme.imageUrl && channel.epgSource !== "fallback") {
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

  xmltv += "</tv>";

  // Add the summary note if available
  if (summaryString) {
    xmltv += `\n<note>${escapeXML(summaryString)}</note>`;
  }

  return xmltv;
}
