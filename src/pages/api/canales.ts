// src/pages/api/canales.ts
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET({ request }) {
  try {
    // Fetch data from Supabase instead of local file
    const { data, error } = await supabase.from("channels").select("*");

    if (error) throw error;

    // Return the data as a response
    return new Response(
      JSON.stringify({
        message:
          "Si estas viendo esto es porque sos muy curioso o porque sos alguien de SYT preguntandose como obtuve todo esto",
        contact: "Email: admin@telelibre.site | Discord: telelibre",
        success: true,
        data: data,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching data from Supabase:", error);

    // Handle errors
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to load data from database",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
