import { readdir, readFile } from "fs/promises";
import path from "path";

// Define special image mappings for specific channel IDs
const SPECIAL_IMAGE_MAPPINGS = {
  49945575:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Cinemax_%28Yellow%29.svg/1200px-Cinemax_%28Yellow%29.svg.png",
};

export async function GET({ params }) {
  try {
    const { id } = params; // Extract the dynamic `id` from the URL

    if (!id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing image identifier in the URL",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if this ID has a special image mapping
    if (SPECIAL_IMAGE_MAPPINGS[id]) {
      try {
        console.log(`Using special image mapping for ID: ${id}`);
        const specialImageUrl = SPECIAL_IMAGE_MAPPINGS[id];

        // Fetch the special image
        const specialImageResponse = await fetch(specialImageUrl);

        if (!specialImageResponse.ok) {
          console.warn(
            `Failed to fetch special image for ${id}, falling back to local`
          );
          // If special image fetch fails, continue with normal flow to try local files
        } else {
          const contentType = specialImageResponse.headers.get("Content-Type");
          const imageBuffer = await specialImageResponse.arrayBuffer();

          // Return the special image
          return new Response(imageBuffer, {
            status: 200,
            headers: {
              "Content-Type": contentType || "image/jpeg",
            },
          });
        }
      } catch (error) {
        console.error(`Error fetching special image for ${id}:`, error);
        // Continue with normal flow to try local files
      }
    }

    // Define the image directory
    const imageDir = path.join(process.cwd(), "public/images");

    // Read all files in the image directory
    const files = await readdir(imageDir);

    // Find the file that matches the image ID (with any extension)
    const matchedFile = files.find((file) => file.startsWith(id));

    if (!matchedFile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Image not found for identifier: ${id}`,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Construct the full path to the matched file
    const filePath = path.join(imageDir, matchedFile);

    // Read the image file
    const fileBuffer = await readFile(filePath);

    // Determine the MIME type based on the file extension
    const fileExtension = path.extname(matchedFile).slice(1);
    const mimeType = getMimeType(fileExtension);

    // Serve the image file
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
      },
    });
  } catch (error) {
    console.error("Error serving image:", error);

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

// Helper function to get MIME type based on file extension
function getMimeType(extension: string) {
  const mimeTypes: Record<string, string> = {
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
