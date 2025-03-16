import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import os from "os";

// Load environment variables
dotenv.config();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Determine optimal number of workers based on CPU cores
const NUM_WORKERS = Math.max(2, Math.min(os.cpus().length - 1, 8)); // At least 2, at most 8 workers

/**
 * Shuffles an array using Fisher-Yates algorithm
 * @param {Array} array The array to shuffle
 * @returns {Array} A new shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Fetches data from a URL with retry logic
 * @param {string} url The URL to fetch from
 * @param {Object} options Fetch options
 * @param {number} maxRetries Maximum number of retry attempts
 * @param {number} baseDelay Base delay between retries in ms
 * @returns {Promise<Object>} The fetch response or throws an error
 */
async function fetchWithRetry(
  url,
  options = {},
  maxRetries = 5,
  baseDelay = 300
) {
  let lastError;

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
 * @param {Array<string>} baseUrls Array of base URLs to fetch from
 * @param {string} endpoint The endpoint to append to each base URL
 * @param {Object} options Optional fetch options
 * @param {number} maxRetries Maximum number of retry attempts per URL
 * @param {Object} channel The channel object for placeholder creation
 * @returns {Promise<Object>} Object with successful and failed responses
 */
async function fetchFromMultipleUrls(
  baseUrls,
  endpoint,
  options = {},
  maxRetries = 5,
  channel = null
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
      const { data, status } = await fetchWithRetry(
        url,
        fetchOptions,
        maxRetries
      );

      // If the response data is empty, add placeholder data
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`No data found for URL: ${url}, adding placeholder data.`);

        // Extract channel ID from the endpoint
        const channelId = channel
          ? channel.id
          : parseInt(endpoint.split("/").pop().split("?")[0]);
        const channelName = channel ? channel.name : "Sin Datos";
        const logoUrl = channel && channel.logo ? channel.logo : null;

        data.push({
          id: `placeholder-${channelId}`,
          title: `Sin datos para ${channelName}`,
          titleBrief: "Sin Datos",
          startTime: "1970-01-01T23:00:00Z",
          endTime: "9999-01-01T01:00:00Z",
          description: "Este canal no tiene informacion de la guia.",
          pgRating: {
            name: "TV-PG",
          },
          cuTvUrl: null,
          catchup: true,
          channelId: channelId,
          titles: {
            ES: `Sin datos para ${channelName}`,
          },
          titleBriefs: {
            ES: "Sin datos",
          },
          descriptions: {
            ES: "Este canal no tiene informacion de la guia.",
          },
          encrypted: true,
          imageUrl: logoUrl || `/sb/image/${channelId}`,
          imageUrls: {},
          vodAssetId: channelId,
          hasNotification: false,
          state: "CATCHUP",
        });
      }

      return { url: baseUrl, data, status };
    } catch (error) {
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

  return {
    success: successfulResponses,
    failed: failedResponses,
    all: results,
  };
}

/**
 * Worker function to process a batch of channels
 */
async function workerFunction() {
  const { channelBatch, baseUrls, tenantId, supabaseUrl, supabaseKey } =
    workerData;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Track which sources were used
  const sourceStats = {};
  baseUrls.forEach((url) => {
    sourceStats[url] = 0;
  });

  let channelsWithValidEpg = 0;
  const results = [];

  // Process each channel in this worker's batch
  for (const channel of channelBatch) {
    try {
      // Try to fetch EPG data from multiple sources
      const epgEndpoint = `/sb/public/epg/channel/${channel.id}?tenantId=${tenantId}`;
      const fetchResults = await fetchFromMultipleUrls(
        baseUrls,
        epgEndpoint,
        {},
        5,
        channel // Pass the channel object to use for placeholder creation
      );

      // Use the first successful response, or return empty EPG if all failed
      let epgData = [];
      let epgSource = null;

      if (fetchResults.success.length > 0) {
        // Find the first response with valid EPG data (non-empty array)
        const validResponse = fetchResults.success.find(
          (response) => Array.isArray(response.data) && response.data.length > 0
        );

        if (validResponse) {
          epgData = validResponse.data;
          epgSource = validResponse.url;
          sourceStats[epgSource] = (sourceStats[epgSource] || 0) + 1;
          channelsWithValidEpg++;
        }
      }

      // Store the EPG data in the database
      const { error: upsertError } = await supabase.from("channels_epg").upsert(
        {
          channel_id: channel.id,
          epg_data: epgData,
          epg_source: epgSource,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "channel_id" }
      );

      if (upsertError) {
        results.push({
          channelId: channel.id,
          success: false,
          error: upsertError.message,
        });
      } else {
        results.push({
          channelId: channel.id,
          success: true,
          epgSource,
          programCount: epgData.length,
        });
      }

      // Add a small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      results.push({
        channelId: channel.id,
        success: false,
        error: error.message,
      });
    }
  }

  // Return the results to the main thread
  parentPort.postMessage({
    results,
    sourceStats,
    channelsWithValidEpg,
  });
}

/**
 * Main function to coordinate worker threads and fetch EPG data
 */
async function fetchAndStoreEPGData() {
  // Only execute this in the main thread
  if (!isMainThread) return;

  try {
    console.log("Starting EPG data fetch process...");
    console.log(`Using ${NUM_WORKERS} worker threads...`);

    const tenantId = "1"; // Default tenant ID

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

    // Create Supabase client for the main thread
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Query all channels from the database
    const { data: channels, error: channelsError } = await supabase
      .from("channels")
      .select("*")
      .order("number", { ascending: true });

    if (channelsError) {
      throw new Error(`Error fetching channels: ${channelsError.message}`);
    }

    console.log(
      `Found ${channels.length} channels. Starting fetch with ${NUM_WORKERS} workers...`
    );

    // Split channels into batches for workers
    const batchSize = Math.ceil(channels.length / NUM_WORKERS);
    const channelBatches = [];

    for (let i = 0; i < channels.length; i += batchSize) {
      channelBatches.push(channels.slice(i, i + batchSize));
    }

    // Track overall progress
    let completedWorkers = 0;
    const globalSourceStats = {};
    let totalChannelsWithValidEpg = 0;
    const allResults = [];

    // Create and start workers for each batch
    const workerPromises = channelBatches.map((batch, index) => {
      return new Promise((resolve) => {
        const worker = new Worker(new URL(import.meta.url), {
          workerData: {
            channelBatch: batch,
            baseUrls,
            tenantId,
            supabaseUrl: SUPABASE_URL,
            supabaseKey: SUPABASE_ANON_KEY,
          },
        });

        worker.on("message", (data) => {
          completedWorkers++;
          console.log(
            `Worker ${index + 1} completed (${completedWorkers}/${NUM_WORKERS})`
          );

          // Combine statistics
          totalChannelsWithValidEpg += data.channelsWithValidEpg;
          allResults.push(...data.results);

          // Combine source stats
          Object.entries(data.sourceStats).forEach(([url, count]) => {
            globalSourceStats[url] = (globalSourceStats[url] || 0) + count;
          });

          resolve();
        });

        worker.on("error", (err) => {
          console.error(`Worker ${index + 1} error:`, err);
          completedWorkers++;
          resolve();
        });

        worker.on("exit", (code) => {
          if (code !== 0) {
            console.error(`Worker ${index + 1} exited with code ${code}`);
          }
        });
      });
    });

    // Wait for all workers to complete
    await Promise.all(workerPromises);

    // Log final statistics
    console.log("EPG source statistics:", globalSourceStats);
    console.log(
      `Successfully fetched EPG for ${totalChannelsWithValidEpg}/${channels.length} channels`
    );

    // Success/error statistics
    const successfulUpdates = allResults.filter((r) => r.success).length;
    console.log(
      `Database updates: ${successfulUpdates} successful, ${
        allResults.length - successfulUpdates
      } failed`
    );
  } catch (error) {
    console.error("Error in EPG fetcher:", error);
  }
}

// Execute worker function if in worker thread, otherwise run main function
if (isMainThread) {
  // Run the main function
  fetchAndStoreEPGData()
    .then(() => {
      console.log("EPG data fetch process completed.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error in EPG fetch process:", error);
      process.exit(1);
    });
} else {
  // Worker thread execution
  workerFunction();
}
