import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/_client";

export function useRealtimeSubscriptions() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => qc.invalidateQueries({ queryKey: ["leads"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pipelines" },
        () => qc.invalidateQueries({ queryKey: ["pipelines"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_pages" },
        () => qc.invalidateQueries({ queryKey: ["leadPages"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automations" },
        () => qc.invalidateQueries({ queryKey: ["automations"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automation_steps" },
        () => qc.invalidateQueries({ queryKey: ["automationSteps"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
