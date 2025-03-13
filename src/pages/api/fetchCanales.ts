import { writeFile, mkdir, access } from "fs/promises";
import path from "path";

const SITE_URL = import.meta.env.SITE_URL;
const USERNAME = import.meta.env.AUTH_USERNAME;
const PASSWORD = import.meta.env.AUTH_PASSWORD;
const TENANT_ID = import.meta.env.AUTH_TENANT_ID;

export async function GET({ request }) {
  try {
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
        const cleanedChannel = cleanObjectStrings(channel);

        // For fetching we need to add "/sb" to the logo URL
        const fetchLogoUrl = cleanedChannel.logoUrl.includes("/sb")
          ? cleanedChannel.logoUrl
          : `/sb${cleanedChannel.logoUrl}`;

        // For saving data we need to use "/image/id" instead of "/sb/image/id"
        const savedLogoUrl = cleanedChannel.logoUrl.includes("/sb")
          ? cleanedChannel.logoUrl.replace("/sb", "")
          : cleanedChannel.logoUrl;

        return {
          number: cleanedChannel.number,
          displayName: cleanedChannel.displayName,
          title: cleanedChannel.title,
          name: cleanedChannel.name,
          titles: cleanedChannel.titles,
          logoUrl: savedLogoUrl, // Save without "/sb" prefix
          contentUrls: {
            hlsFP: cleanedChannel.contentUrls?.hlsFP,
            dash: cleanedChannel.contentUrls?.dash,
          },
          imageUrl: savedLogoUrl, // Use the correct format for saving
          fetchLogoUrl: fetchLogoUrl, // Keep the fetch URL for downloading images
          id: cleanedChannel.id, // Keep the channel ID for reference
        };
      })
      .filter(
        (channel) =>
          !channel.displayName?.includes("Canal Support") &&
          !channel.title?.includes("Canal Support") &&
          !channel.name?.includes("Canal Support")
      );

    await writeFile(
      "./src/data.json",
      JSON.stringify(processedData, null, 2),
      "utf-8"
    );

    await mkdir("./public/images", { recursive: true });

    const fetchWithTimeout = async (url: string, timeoutMs: number) => {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      );
      return Promise.race([fetch(url), timeout]);
    };

    // Function to attempt image fetch from all base URLs if needed
    const fetchImageFromAllBaseUrls = async (
      logoPath: string,
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
      console.log(`Trying all base URLs for ${logoPath}`);

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

      throw new Error(`Image not found on any base URL: ${logoPath}`);
    };

    const imageSavePromises = processedData.map(async (item) => {
      if (item.fetchLogoUrl) {
        try {
          const { response: response2, baseUrl: successfulBaseUrl } =
            await fetchImageFromAllBaseUrls(item.fetchLogoUrl);

          const contentType = response2.headers.get("Content-Type");
          const extension = getExtensionFromContentType(contentType);

          if (!extension) {
            console.warn(
              `Unknown Content-Type for image: ${item.fetchLogoUrl}`
            );
            return;
          }

          const fileName = `${path.basename(item.logoUrl)}${extension}`;
          const imagePath = path.join("./public/images", fileName);

          try {
            await access(imagePath);
            console.log(`Image already exists: ${imagePath}`);
            return;
          } catch {
            // File does not exist, proceed to download
          }

          const buffer = await response2.arrayBuffer();
          await writeFile(imagePath, Buffer.from(buffer));

          console.log(`Image saved: ${imagePath} (from ${successfulBaseUrl})`);
        } catch (error) {
          console.error(
            `Error saving image for channel ${item.id || "unknown"}: ${
              error.message
            }`
          );
        }
      }
    });

    await Promise.all(imageSavePromises);

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
    console.error("Error reading JSON file or saving image:", error);

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
