// File: src/pages/api/epg/[channelId].ts
import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const GET: APIRoute = async ({ params, locals }) => {
  const supabaseUrl = import.meta.env.PROD
    ? locals.runtime.env.SUPABASE_URL
    : import.meta.env.SUPABASE_URL;

  const supabaseKey = import.meta.env.PROD
    ? locals.runtime.env.SUPABASE_ANON_KEY
    : import.meta.env.SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    // Extract the channel ID from the URL path
    const { channelId } = params;
    console.log(channelId)
    if (!channelId) {
      return new Response(JSON.stringify({ error: "Channel ID is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Convert channelId to integer since it's defined as integer in the database
    const channelIdInt = parseInt(channelId);

    if (isNaN(channelIdInt)) {
      return new Response(
        JSON.stringify({ error: "Invalid channel ID format" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Query the database for EPG data using Supabase
    const { data, error } = await supabase
      .from("channels_epg")
      .select("epg_data, updated_at")
      .eq("channel_id", channelIdInt)
      .single();

    // Handle database query error
    if (error) {
      console.error("Supabase query error:", error);
      return new Response(
        JSON.stringify({
          error: "Database query error",
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

    // Check if EPG data exists for the channel
    if (!data) {
      return new Response(
        JSON.stringify({ error: "EPG data not found for this channel" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Get the EPG data and updated timestamp
    const { epg_data, updated_at } = data;

    // Process the EPG data - filter out CATCHUP items
    const filteredData = epg_data
      .filter((item) => item.state)
      .map((item) => {
        // Process each item here if needed
        return item; // You can transform the item if required
      });

    // Return the data with last update timestamp
    return new Response(
      JSON.stringify({
        data: filteredData,
        lastUpdated: updated_at,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        },
      }
    );
  } catch (error) {
    console.error("Error fetching EPG data from database:", error);

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
};
