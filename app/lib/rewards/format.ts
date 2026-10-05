export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";
export const fmtMoney = (n: number | string | null | undefined, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Number(n ?? 0));
export const fmtInt = (n: number | null | undefined) => new Intl.NumberFormat("en-CA").format(n ?? 0);
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
/** Parses a number field. Empty or invalid input returns the fallback (never silently 0). */
export const num = (fd: FormData, k: string, fallback = 0) => {
  const raw = str(fd, k);
  if (raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
};
export const bool = (fd: FormData, k: string) => fd.get(k) != null && fd.get(k) !== "false";
