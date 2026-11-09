import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CLOUD_ACTION_EVENT } from "@/lib/store";
import {
  flushCloudOutbox, handleCloudActionEvent, handleRealtimeVersion, initializeCloud, refreshCloudIfIdle, useCloud,
} from "@/lib/cloud-sync";
import {
  presenceDevices, useCloudPresence, type DeviceType, type PresencePayload,
} from "@/lib/cloud-presence";

function deviceIdentity(): { id: string; deviceType: DeviceType } {
  const key = "mohra-cloud-device-v1";
  let id = window.sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(key, id);
  }
  return { id, deviceType: window.matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop" };
}

export function CloudSync() {
  const shopId = useCloud((s) => s.shopId);
  const role = useCloud((s) => s.role);
  const connected = useCloud((s) => s.status === "connected");

  useEffect(() => {
    void initializeCloud();
    const retryPending = () => void flushCloudOutbox();
    window.addEventListener(CLOUD_ACTION_EVENT, handleCloudActionEvent);
    window.addEventListener("online", retryPending);
    return () => {
      window.removeEventListener(CLOUD_ACTION_EVENT, handleCloudActionEvent);
      window.removeEventListener("online", retryPending);
    };
  }, []);

  useEffect(() => {
    if (!shopId || !connected) return;
    if (role === "cashier") {
      // Cashiers receive a server-filtered snapshot; they never subscribe to the raw private state.
      const timer = window.setInterval(refreshCloudIfIdle, 15_000);
      return () => window.clearInterval(timer);
    }
    const channel = supabase
      .channel(`shop-state-${shopId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shop_states", filter: `shop_id=eq.${shopId}` }, (payload) => {
        const version = (payload.new as { version?: number }).version;
        if (typeof version === "number") handleRealtimeVersion(version);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [shopId, connected, role]);

  useEffect(() => {
    if (!shopId || !connected || !role) return;
    const identity = deviceIdentity();
    useCloudPresence.setState({ status: "connecting", devices: [] });
    const channel = supabase.channel(`shop-presence-${shopId}`, {
      config: { presence: { key: identity.id } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        useCloudPresence.setState({
          status: "online",
          devices: presenceDevices(channel.presenceState<PresencePayload>(), identity.id),
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          useCloudPresence.setState({ status: "online" });
          void channel.track({ role, deviceType: identity.deviceType, onlineAt: Date.now() } satisfies PresencePayload)
            .then((result) => { if (result !== "ok") useCloudPresence.setState({ status: "error" }); })
            .catch(() => useCloudPresence.setState({ status: "error" }));
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          useCloudPresence.setState({ status: "error" });
        }
      });
    return () => {
      useCloudPresence.setState({ status: "idle", devices: [] });
      void supabase.removeChannel(channel);
    };
  }, [shopId, connected, role]);

  return null;
}
