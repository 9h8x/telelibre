// src/pages/api/canales.ts

export const prerender = false;

import { createClient } from "@supabase/supabase-js";

export async function GET({ request, locals }) {
  try {
    // Detect environment and get appropriate env variables
    let supabaseUrl;
    let supabaseKey;

    // Check if we're in development or production
    const isDevelopment = import.meta.env.DEV;

    if (isDevelopment) {
      // Development: use import.meta.env
      supabaseUrl = import.meta.env.SUPABASE_URL;
      supabaseKey = import.meta.env.SUPABASE_ANON_KEY;
      console.log("Running in development mode");
    } else {
      // Production: use locals.runtime.env
      const { env } = locals.runtime;
      supabaseUrl = env.SUPABASE_URL;
      supabaseKey = env.SUPABASE_ANON_KEY;
      console.log("Running in production mode");
    }

    // Validate that we have the required environment variables
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing required Supabase environment variables");
    }

    // Initialize Supabase client with the appropriate env vars
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch data from Supabase
    const { data, error } = await supabase.from("channels").select("*");

    if (error) throw error;

    // Return the data as a response
    return new Response(
      JSON.stringify({
        message:
          "Si estas viendo esto es porque sos muy curioso o porque sos alguien de SYT preguntandose como obtuve todo esto",
        contact: "Email: telelibre@proton.me | Discord: telelibre",
        success: true,
        data: data,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          // Add CORS headers
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching data from Supabase:", error);

    // Handle errors
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to load data from database",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          // Add CORS headers even for errors
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }
}
