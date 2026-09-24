import { useEffect } from "react";
import { useActionData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

/** Shows a Shopify admin toast for whatever the route action returned: {error} | {message} | {ok}. */
export function useActionToast() {
  const shopify = useAppBridge();
  const data = useActionData<any>();
  const nav = useNavigation();
  useEffect(() => {
    if (nav.state !== "idle" || !data) return;
    if (data.error) shopify.toast.show(String(data.error), { isError: true, duration: 5000 });
    else if (data.message) shopify.toast.show(String(data.message));
    else if (data.ok) shopify.toast.show("Saved");
  }, [data, nav.state, shopify]);
}
