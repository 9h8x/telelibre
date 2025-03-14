import { createClient } from "@supabase/supabase-js";
export const prerender = false;

export async function GET({ request, locals }) {
  try {
    const { env } = locals.runtime;

    // Access environment variables from Cloudflare runtime
    const SITE_URL = env.SITE_URL;
    const USERNAME = env.AUTH_USERNAME;
    const PASSWORD = env.AUTH_PASSWORD;
    const TENANT_ID = env.AUTH_TENANT_ID;

    // Initialize Supabase client with Cloudflare runtime env vars
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate and get the session key
    async function authenticate(
      username: string,
      password: string,
      tenantId: string
    ) {
      const loginResponse = await fetch(`${SITE_URL}/api/auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, tenantId }),
      });

      if (!loginResponse.ok) {
        throw new Error("Authentication failed");
      }

      const loginData = await loginResponse.json();
      return loginData;
    }

    const loginData = await authenticate(USERNAME, PASSWORD, TENANT_ID);

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

    // Function to get a random base URL
    const getRandomBaseUrl = () => {
      const randomIndex = Math.floor(Math.random() * baseUrls.length);
      return baseUrls[randomIndex];
    };

    const baseUrl = getRandomBaseUrl();

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
    myHeaders.append("Te", "trailers");
    myHeaders.append("Connection", "keep-alive");

    const response = await fetch(
      `${baseUrl}/sb/channel/all?vf=dash&visibilityRights=PREVIEW`,
      { redirect: "follow", method: "GET", headers: myHeaders }
    );

    const rawData = await response.json();

    if (rawData.status && rawData.error) {
      console.error(
        `Error fetching data from ${baseUrl}: ${rawData.message} (Status: ${rawData.status})`
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: rawData.message || "Unknown error",
          status: rawData.status,
        }),
        {
          status: rawData.status || 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const newData = Array.isArray(rawData) ? rawData : rawData.data || [];

    if (!Array.isArray(newData)) {
      throw new Error("Invalid data format: Expected an array.");
    }

    // Helper function to clean strings
    const cleanString = (str: string) => {
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
    const cleanObjectStrings = (obj: any) => {
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

    // Process new data
    const processedData = newData
      .filter((channel) => channel.id !== 1032) // Filter out unwanted channels
      .map((channel) => {
        // Store the original ID before cleaning
        const originalId = channel.id;

        const cleanedChannel = cleanObjectStrings(channel);

        // For fetching we need to add "/sb" to the logo URL
        const fetchLogoUrl = cleanedChannel.logoUrl.includes("/sb")
          ? cleanedChannel.logoUrl
          : `/sb${cleanedChannel.logoUrl}`;

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
          fetchLogoUrl: fetchLogoUrl, // Keep the fetch URL for downloading images
          id: originalId, // Use the original ID, not the cleaned one
        };
      })
      .filter(
        (channel) =>
          !channel.displayName?.includes("Canal Support") &&
          !channel.title?.includes("Canal Support") &&
          !channel.name?.includes("Canal Support")
      );

    // Instead of writing to a local file, store the data in Supabase

    // First, clear the existing data (optional - you might want to implement a different approach)
    const { error: deleteError } = await supabase
      .from("channels")
      .delete()
      .neq("id", 0); // This effectively deletes all rows

    if (deleteError) {
      console.error("Error clearing existing channel data:", deleteError);
    }

    // Insert the new channel data
    const { error: insertError } = await supabase
      .from("channels")
      .insert(processedData);

    if (insertError) {
      throw insertError;
    }

    // Download and store channel logos in Supabase Storage
    const fetchWithTimeout = async (url: string, timeoutMs: number) => {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      );
      return Promise.race([fetch(url), timeout]);
    };

    // Function to attempt image fetch from all base URLs if needed
    const fetchImageFromAllBaseUrls = async (
      logoPath: string,
      imageId: string,
      timeoutMs: number = 10000
    ) => {
      // Try with a random base URL first
      let initialBaseUrl = getRandomBaseUrl();
      let imageUrl = `${initialBaseUrl}${logoPath}`;

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
      console.log(
        `Trying all base URLs for ${logoPath} (image ID: ${imageId})`
      );

      for (const baseUrl of baseUrls) {
        if (baseUrl === initialBaseUrl) continue; // Skip the one we already tried

        imageUrl = `${baseUrl}${logoPath}`;
        try {
          const response = await fetchWithTimeout(imageUrl, timeoutMs);
          if (response.ok) {
            console.log(`Successfully found image at ${baseUrl}`);
            return { response, baseUrl };
          }
        } catch (error) {
          console.warn(
            `Failed to fetch image from ${baseUrl}: ${error.message}`
          );
        }
      }

      throw new Error(
        `Image not found on any base URL: ${logoPath} (image ID: ${imageId})`
      );
    };

    // Check if channel logo already exists in Supabase Storage
    const imageUploadPromises = processedData.map(async (item) => {
      if (item.fetchLogoUrl && item.id) {
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

          // Fetch the image
          const { response, baseUrl } = await fetchImageFromAllBaseUrls(
            item.fetchLogoUrl,
            imageId.toString(), // Use image ID for logging
            10000
          );

          const contentType = response.headers.get("Content-Type");
          const extension = getExtensionFromContentType(contentType) || ".jpg";

          // Generate a filename using the image ID, not the channel ID
          const fileName = `${imageId}${extension}`;

          // Convert response to blob
          const imageBlob = await response.blob();

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from("channel-logos")
            .upload(fileName, imageBlob, {
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
        }
      }
    });

    await Promise.all(imageUploadPromises);

    return new Response(
      JSON.stringify({
        success: true,
        data: processedData,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing channels or uploading images:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Helper function to get file extension from Content-Type
function getExtensionFromContentType(contentType: string | null) {
  const mimeToExtension: Record<string, string> = {
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
