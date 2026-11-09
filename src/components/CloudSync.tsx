import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CLOUD_ACTION_EVENT } from "@/lib/store";
import {
  handleCloudActionEvent, handleRealtimeVersion, initializeCloud, useCloud,
} from "@/lib/cloud-sync";

export function CloudSync() {
  const shopId = useCloud((s) => s.shopId);
  const connected = useCloud((s) => s.status === "connected");

  useEffect(() => {
    void initializeCloud();
    window.addEventListener(CLOUD_ACTION_EVENT, handleCloudActionEvent);
    return () => window.removeEventListener(CLOUD_ACTION_EVENT, handleCloudActionEvent);
  }, []);

  useEffect(() => {
    if (!shopId || !connected) return;
    const channel = supabase
      .channel(`shop-state-${shopId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shop_states", filter: `shop_id=eq.${shopId}` }, (payload) => {
        const version = (payload.new as { version?: number }).version;
        if (typeof version === "number") handleRealtimeVersion(version);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [shopId, connected]);

  return null;
}
