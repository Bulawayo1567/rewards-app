import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) throw redirect(`/app?${url.searchParams.toString()}`);
  return { showForm: Boolean(login) };
};

const RED = "#c60d11", INK = "#1f1f1f", BLUSH = "#f4d3d5";

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  return (
    <main style={{
      minHeight: "100vh", margin: 0, display: "grid", placeItems: "center", padding: 24, boxSizing: "border-box",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: INK,
      backgroundColor: BLUSH,
      backgroundImage: "repeating-linear-gradient(0deg, rgba(198,13,17,.10) 0 14px, transparent 14px 28px), repeating-linear-gradient(90deg, rgba(198,13,17,.10) 0 14px, transparent 14px 28px), repeating-linear-gradient(0deg, rgba(255,255,255,.45) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(255,255,255,.45) 0 1px, transparent 1px 3px)",
    }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 440, background: "#fff", borderRadius: 20, padding: "40px 36px 32px", boxShadow: "0 24px 60px rgba(0,0,0,.18)", textAlign: "center" }}>
        <div style={{ position: "absolute", inset: 12, border: `2px dashed ${RED}`, borderRadius: 14, opacity: .45, pointerEvents: "none" }} />
        <img src="/img/icon" alt="" width={96} height={96} style={{ display: "block", margin: "0 auto 14px", borderRadius: 22 }} />
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.01em" }}>All About Sewing Rewards</h1>
        <p style={{ margin: "8px 0 24px", color: "#555", fontSize: 15, lineHeight: 1.5 }}>
          Points, tiers and rewards for All About Sewing customers. Sign in with your store to open the app.
        </p>
        {showForm && (
          <Form method="post" action="/auth/login" style={{ display: "grid", gap: 12 }}>
            <label style={{ textAlign: "left", fontSize: 13, fontWeight: 600 }}>
              Shop domain
              <input name="shop" type="text" placeholder="my-shop.myshopify.com" required
                style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: "13px 14px", border: "1.5px solid #ddd", borderRadius: 12, fontSize: 15, fontFamily: "inherit" }} />
            </label>
            <button type="submit" style={{ position: "relative", padding: "14px 18px", border: 0, borderRadius: 12, background: RED, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ position: "absolute", inset: 5, border: "1.5px dashed rgba(255,255,255,.7)", borderRadius: 8, pointerEvents: "none" }} />
              Sign In
            </button>
          </Form>
        )}
        <p style={{ margin: "18px 0 0", fontSize: 12, color: "#8a8a8a" }}>Store staff only · allaboutsewing.ca</p>
      </div>
    </main>
  );
}
