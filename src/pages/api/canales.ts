import { readFile } from 'fs/promises';

export async function GET({ request }) {
  try {
    // Read the JSON file
    const data = await readFile('./src/data.json', 'utf-8');
    
    // Parse the JSON data
    const parsedData = JSON.parse(data);

    // Return the parsed data as a response
    return new Response(
      JSON.stringify({
        message: 'Si estas viendo esto es porque sos muy curioso o porque sos alguien de SYT preguntandose como obtuve todo esto',
        contact: 'Email: admin@telelibre.site | Discord: telelibre',
        success: true,
        data: parsedData,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('Error reading JSON file:', error);

    // Handle errors (e.g., file not found, invalid JSON)
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to load data from JSON file",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
