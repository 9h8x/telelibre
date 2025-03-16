import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Environment variables - loaded from .env file
const USERNAME = process.env.AUTH_USERNAME;
const PASSWORD = process.env.AUTH_PASSWORD;
const TENANT_ID = process.env.AUTH_TENANT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Authenticate and get the session key
async function authenticate(username, password, tenantId) {
  try {
    if (!username || !password || !tenantId) {
      throw new Error(
        "Missing required fields: username, password, or tenantId"
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
        throw new Error("Missing auth key in response headers");
      }

      return { success: true, authKey: xSessionId };
    }

    // Handle unsuccessful login
    const errorData = await response.json();
    throw new Error(`Authentication failed: ${JSON.stringify(errorData)}`);
  } catch (error) {
    console.error("Error during login:", error);
    throw new Error(`Authentication error: ${error.message}`);
  }
}

// Function to get a random base URL
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

const getRandomBaseUrl = () => {
  const randomIndex = Math.floor(Math.random() * baseUrls.length);
  return baseUrls[randomIndex];
};

// Helper function to clean strings
const cleanString = (str) => {
  if (typeof str === "string") {
    return str
      .replace(/\s*-\s*support\s*tv/gi, "")
      .replace(/\s*-\s*supporttv/gi, "")
      .replace(/support\s*tv/gi, "")
      .replace(/supporttv/gi, "")
      .trim();
  }
  return str;
};

// Clean all string values in an object recursively
const cleanObjectStrings = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === "string") {
      obj[key] = cleanString(obj[key]);
    } else if (typeof obj[key] === "object") {
      cleanObjectStrings(obj[key]);
    }
  });

  return obj;
};

// Function to attempt image fetch with timeout
const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Function to attempt image fetch from all base URLs if needed
const fetchImageFromAllBaseUrls = async (
  logoPath,
  imageId,
  timeoutMs = 10000
) => {
  // Make sure logoPath has /sb prefix for fetching
  const fetchPath = logoPath.includes("/sb") ? logoPath : `/sb${logoPath}`;

  // Try with a random base URL first
  let initialBaseUrl = getRandomBaseUrl();
  let imageUrl = `${initialBaseUrl}${fetchPath}`;

  try {
    const response = await fetchWithTimeout(imageUrl, timeoutMs);
    if (response.ok) {
      return { response, baseUrl: initialBaseUrl };
    }
  } catch (error) {
    // Initial attempt failed, will try other base URLs
    console.warn(
      `Initial image fetch failed for ${imageUrl}: ${error.message}`
    );
  }

  // If the first attempt failed, try with each base URL sequentially
  console.log(`Trying all base URLs for ${fetchPath} (image ID: ${imageId})`);

  for (const baseUrl of baseUrls) {
    if (baseUrl === initialBaseUrl) continue; // Skip the one we already tried

    imageUrl = `${baseUrl}${fetchPath}`;
    try {
      const response = await fetchWithTimeout(imageUrl, timeoutMs);
      if (response.ok) {
        console.log(`Successfully found image at ${baseUrl}`);
        return { response, baseUrl };
      }
    } catch (error) {
      console.warn(`Failed to fetch image from ${baseUrl}: ${error.message}`);
    }
  }

  throw new Error(
    `Image not found on any base URL: ${fetchPath} (image ID: ${imageId})`
  );
};

// Helper function to get file extension from Content-Type
function getExtensionFromContentType(contentType) {
  const mimeToExtension = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
    "image/x-icon": ".ico",
    "image/tiff": ".tiff",
  };

  return mimeToExtension[contentType || ""] || null;
}

async function main() {
  try {
    // Check if required environment variables are set
    if (
      !USERNAME ||
      !PASSWORD ||
      !TENANT_ID ||
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY
    ) {
      console.error(
        "Missing required environment variables. Please check your .env file."
      );
      console.error(
        "Required variables: AUTH_USERNAME, AUTH_PASSWORD, AUTH_TENANT_ID, SUPABASE_URL, SUPABASE_ANON_KEY"
      );
      return;
    }

    console.log("Starting channel fetch process...");

    // Authenticate directly using the integrated authentication function
    console.log("Authenticating...");
    const loginData = await authenticate(USERNAME, PASSWORD, TENANT_ID);
    console.log("Authentication successful");

    const baseUrl = getRandomBaseUrl();
    console.log(`Using base URL: ${baseUrl}`);

    // Set up headers for the request
    const myHeaders = new Headers();
    myHeaders.append("Host", "ver.tele.com.ar");
    myHeaders.append(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0"
    );
    myHeaders.append("Accept", "application/json");
    myHeaders.append("Accept-Language", "en-US,en;q=0.5");
    myHeaders.append("Accept-Encoding", "gzip, deflate, br");
    myHeaders.append("Referer", `${baseUrl}/`);
    myHeaders.append("Access-Control-Allow-Headers", "*");
    myHeaders.append("X-Session-Id", loginData.authKey);
    myHeaders.append("Mcbrand", "Firefox");
    myHeaders.append(
      "User-Agent-App",
      "Rocstar WEB/1.0.89 (Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/136.0)"
    );
    myHeaders.append("Sec-Fetch-Dest", "empty");
    myHeaders.append("Sec-Fetch-Mode", "cors");
    myHeaders.append("Sec-Fetch-Site", "same-origin");
    myHeaders.append("Connection", "keep-alive");

    // Fetch channel data
    console.log("Fetching channel data...");
    const response = await fetch(
      `${baseUrl}/sb/channel/all?vf=dash&visibilityRights=PREVIEW`,
      { redirect: "follow", method: "GET", headers: myHeaders }
    );

    const rawData = await response.json();

    if (rawData.status && rawData.error) {
      console.error(
        `Error fetching data from ${baseUrl}: ${rawData.message} (Status: ${rawData.status})`
      );
      return;
    }

    const newData = Array.isArray(rawData) ? rawData : rawData.data || [];

    if (!Array.isArray(newData)) {
      throw new Error("Invalid data format: Expected an array.");
    }

    console.log(`Fetched ${newData.length} channels`);

    // Process channel data
    console.log("Processing channel data...");
    const processedData = newData
      .filter((channel) => channel.id !== 1032) // Filter out unwanted channels
      .map((channel) => {
        // Store the original ID before cleaning
        const originalId = channel.id;

        const cleanedChannel = cleanObjectStrings(channel);

        // For saving data we need to use "/image/id" instead of "/sb/image/id"
        const savedLogoUrl = cleanedChannel.logoUrl.includes("/sb")
          ? cleanedChannel.logoUrl.replace("/sb", "")
          : cleanedChannel.logoUrl;

        // Extract just the ID by removing the /image/ prefix
        const imageId = savedLogoUrl.replace("/image/", "");

        return {
          number: cleanedChannel.number,
          displayName: cleanedChannel.displayName,
          title: cleanedChannel.title,
          name: cleanedChannel.name,
          titles: cleanedChannel.titles,
          logoUrl: savedLogoUrl, // Keep the full path for reference
          contentUrls: {
            hlsFP: cleanedChannel.contentUrls?.hlsFP,
            dash: cleanedChannel.contentUrls?.dash,
          },
          imageUrl: savedLogoUrl, // Keep the full path for reference
          id: originalId, // Use the original ID, not the cleaned one
        };
      })
      .filter(
        (channel) =>
          !channel.displayName?.includes("Canal Support") &&
          !channel.title?.includes("Canal Support") &&
          !channel.name?.includes("Canal Support")
      );

    console.log(`Processed ${processedData.length} channels`);

    // Fetch existing channel data to preserve logoPublicUrl values
    console.log("Fetching existing channel data to preserve logo URLs...");
    const { data: existingChannels, error: fetchError } = await supabase
      .from("channels")
      .select("id, logoPublicUrl");

    if (fetchError) {
      console.error("Error fetching existing channel data:", fetchError);
    }

    // Create a map of existing logoPublicUrl values by channel ID
    const existingLogoUrls = {};
    if (existingChannels) {
      existingChannels.forEach((channel) => {
        if (channel.logoPublicUrl) {
          existingLogoUrls[channel.id] = channel.logoPublicUrl;
        }
      });
    }

    // Clear existing data in Supabase
    console.log("Clearing existing channel data...");
    const { error: deleteError } = await supabase
      .from("channels")
      .delete()
      .neq("id", 0); // This effectively deletes all rows

    if (deleteError) {
      console.error("Error clearing existing channel data:", deleteError);
    }

    // Add existing logoPublicUrl values to the processed data
    processedData.forEach((channel) => {
      if (existingLogoUrls[channel.id]) {
        channel.logoPublicUrl = existingLogoUrls[channel.id];
        console.log(
          `Preserved existing logo URL for channel ${channel.id}: ${channel.logoPublicUrl}`
        );
      }
    });

    // Insert the new channel data
    console.log("Inserting new channel data...");
    const { error: insertError } = await supabase
      .from("channels")
      .insert(processedData);

    if (insertError) {
      throw insertError;
    }

    console.log("Channel data inserted successfully");

    // Download and store channel logos
    console.log("Processing channel logos...");
    const imageUploadPromises = processedData.map(async (item) => {
      if (item.logoUrl && item.id) {
        try {
          // Extract the image ID from the imageUrl (remove "/image/" prefix)
          const imageId = item.imageUrl.replace("/image/", "");

          // Check if image already exists in storage by searching for the image ID
          const { data: existingFiles, error: checkError } =
            await supabase.storage.from("channel-logos").list("", {
              search: imageId, // Search for files starting with the image ID
            });

          // If image already exists, skip it
          if (!checkError && existingFiles && existingFiles.length > 0) {
            console.log(
              `Image already exists for image ID ${imageId} (channel ${item.id})`
            );
            return;
          }

          // Fetch the image - using the logoUrl directly
          // Fetch the image - using the logoUrl directly
          const { response, baseUrl } = await fetchImageFromAllBaseUrls(
            item.logoUrl, // Use logoUrl directly for fetching
            imageId.toString(), // Use image ID for logging
            10000
          );

          const contentType = response.headers.get("Content-Type");
          const extension = getExtensionFromContentType(contentType) || ".jpg";

          // Generate a filename using the image ID, not the channel ID
          const fileName = `${imageId}${extension}`;

          // Convert response to blob
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from("channel-logos")
            .upload(fileName, buffer, {
              contentType,
              upsert: true,
            });

          if (uploadError) {
            throw uploadError;
          }

          console.log(
            `Image saved to Supabase Storage: ${fileName} (from ${baseUrl})`
          );

          // Get the public URL for the uploaded image
          const { data: publicUrlData } = supabase.storage
            .from("channel-logos")
            .getPublicUrl(fileName);

          // Update the channel record with the new image URL
          if (publicUrlData) {
            const { error: updateError } = await supabase
              .from("channels")
              .update({ logoPublicUrl: publicUrlData.publicUrl })
              .eq("id", item.id);

            if (updateError) {
              console.error(
                `Error updating channel ${item.id} with logo URL:`,
                updateError
              );
            } else {
              console.log(
                `Updated channel ${item.id} with logo URL: ${publicUrlData.publicUrl}`
              );
            }
          }
        } catch (error) {
          console.error(
            `Error saving image for channel ${item.id || "unknown"}: ${
              error.message
            }`
          );

          // If there was an error uploading the new image but we have an existing URL,
          // make sure we don't lose it (it's already preserved in the initial insert)
          console.log(`Keeping existing logo URL for channel ${item.id}`);
        }
      }
    });

    await Promise.all(imageUploadPromises);
    console.log("Channel logo processing complete");

    console.log("Channel fetch process completed successfully");
  } catch (error) {
    console.error("Error processing channels or uploading images:", error);
  }
}

// Run the main function
main();
