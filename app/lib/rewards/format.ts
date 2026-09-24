export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";
export const fmtMoney = (n: number | string | null | undefined, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Number(n ?? 0));
export const fmtInt = (n: number | null | undefined) => new Intl.NumberFormat("en-CA").format(n ?? 0);
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const num = (fd: FormData, k: string, fallback = 0) => {
  const v = Number(str(fd, k));
  return Number.isFinite(v) ? v : fallback;
};
export const bool = (fd: FormData, k: string) => fd.get(k) != null && fd.get(k) !== "false";
