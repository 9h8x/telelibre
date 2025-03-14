import { createClient } from "@supabase/supabase-js";

// Define special image mappings for specific image IDs
const SPECIAL_IMAGE_MAPPINGS = {
  // Use image IDs as keys (the numbers after /image/)
  "5809896": "https://example.com/special-image.png",
};

// Default fallback image URL for when all other methods fail
const DEFAULT_FALLBACK_IMAGE =
  "https://placehold.co/300x200?text=No+Image+Available";

export async function GET({ request, locals }) {
  try {
    const { env } = locals.runtime;

    // Initialize Supabase client using environment variables from runtime
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract the image ID from the URL
    const url = new URL(request.url);
    const imageId = url.pathname.split("/").pop();

    if (!imageId) {
      // Redirect to default fallback if no ID is provided
      return redirectToFallback();
    }

    // Check if this image ID has a special mapping
    if (SPECIAL_IMAGE_MAPPINGS[imageId]) {
      try {
        console.log(`Using special image mapping for ID: ${imageId}`);
        const specialImageUrl = SPECIAL_IMAGE_MAPPINGS[imageId];

        // Fetch the special image
        const specialImageResponse = await fetch(specialImageUrl);

        if (!specialImageResponse.ok) {
          console.warn(
            `Failed to fetch special image for ${imageId}, falling back to storage`
          );
          // If special image fetch fails, continue with normal flow
        } else {
          const contentType = specialImageResponse.headers.get("Content-Type");
          const imageBuffer = await specialImageResponse.arrayBuffer();

          // Return the special image
          return new Response(imageBuffer, {
            status: 200,
            headers: {
              "Content-Type": contentType || "image/jpeg",
              "Cache-Control": "public, max-age=86400", // Cache for 24 hours
            },
          });
        }
      } catch (error) {
        console.error(`Error fetching special image for ${imageId}:`, error);
        // Continue with normal flow
      }
    }

    // Get all files in the channel-logos bucket
    const { data: files, error: listError } = await supabase.storage
      .from("channel-logos")
      .list("");

    if (listError) {
      console.error("Error listing files:", listError);
      // Continue to the next fallback instead of throwing
    }

    // Find a file that matches the image ID, regardless of extension
    const matchedFile = files?.find((file) => {
      const fileName = file.name.split(".")[0]; // Get filename without extension
      return fileName === imageId;
    });

    if (matchedFile) {
      try {
        // Download the file from Supabase Storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("channel-logos")
          .download(matchedFile.name);

        if (downloadError || !fileData) {
          console.error("Error downloading file:", downloadError);
          // Continue to the next fallback
        } else {
          // Determine the MIME type based on the file extension
          const fileExtension = matchedFile.name.split(".").pop() || "";
          const mimeType = getMimeType(fileExtension);

          // Convert blob to array buffer
          const arrayBuffer = await fileData.arrayBuffer();

          // Serve the image file
          return new Response(arrayBuffer, {
            status: 200,
            headers: {
              "Content-Type": mimeType,
              "Cache-Control": "public, max-age=86400", // Cache for 24 hours
            },
          });
        }
      } catch (error) {
        console.error("Error processing matched file:", error);
        // Continue to the next fallback
      }
    }

    // If no direct match in storage, try to find the channel that has this image ID
    try {
      const { data: channelData, error: channelError } = await supabase
        .from("channels")
        .select("logoPublicUrl")
        .filter("imageUrl", "ilike", `%/image/${imageId}`)
        .single();

      if (!channelError && channelData && channelData.logoPublicUrl) {
        // Redirect to the public URL if available
        return new Response(null, {
          status: 302,
          headers: {
            Location: channelData.logoPublicUrl,
            "Cache-Control": "public, max-age=3600", // Cache for 1 hour
          },
        });
      }
    } catch (error) {
      console.error("Error querying channel data:", error);
      // Continue to the fallback
    }

    // If all methods fail, use the default fallback image
    return redirectToFallback();
  } catch (error) {
    console.error("Error serving image:", error);
    // Even if there's an error, still return the fallback image
    return redirectToFallback();
  }
}

// Helper function to redirect to the fallback image
function redirectToFallback() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: DEFAULT_FALLBACK_IMAGE,
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
    },
  });
}

// Helper function to get MIME type based on file extension
function getMimeType(extension) {
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    tiff: "image/tiff",
    tif: "image/tiff",
  };

  return mimeTypes[extension.toLowerCase()] || "application/octet-stream"; // Default to binary stream
}
