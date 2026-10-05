/** Template metadata — safe for both server and browser. */
export type TemplateKey = "welcome" | "birthday_reminder" | "subscribe_reminder" | "how_to_redeem" | "balance_reminder" | "expiring_soon" | "dormant" | "tier_up" | "announcement";

export const TEMPLATES: Record<TemplateKey, { name: string; desc: string; cadence: "event" | "once" | "weekly" | "monthly"; defaultSubject: string; audience: string; consentNote?: string }> = {
  welcome:            { name: "Welcome to the program", desc: "Sent once when someone joins. Explains earning, shows their balance.", cadence: "event", defaultSubject: "Welcome to {program} 🧵", audience: "New members (on join)" },
  birthday_reminder:  { name: "Add your birthday", desc: "Nudges members who haven't added a birthday to collect the bonus.", cadence: "monthly", defaultSubject: "Tell us your birthday — there's a gift in it", audience: "Members with no birthday on file" },
  subscribe_reminder: { name: "Subscribe for rewards news", desc: "One-time note to customers who have bought from you but aren't subscribed.", cadence: "once", defaultSubject: "Don't miss your {points} — stay in the loop", audience: "Customers with a purchase in the last 2 years, not subscribed", consentNote: "Sends to non-subscribed customers under CASL implied consent (recent purchase). Sent once only. Enable deliberately." },
  how_to_redeem:      { name: "How to redeem", desc: "Walks members with a balance through spending it.", cadence: "once", defaultSubject: "You've got {balance} {points} — here's how to spend them", audience: "Members with a balance who have never redeemed" },
  balance_reminder:   { name: "Your points are worth…", desc: "Regular reminder of balance and dollar value.", cadence: "monthly", defaultSubject: "Your {points} are worth {worth} right now", audience: "Members at or above the minimum to redeem" },
  expiring_soon:      { name: "Points expiring soon", desc: "Warns members 30 days before points expire (only if expiry is on).", cadence: "weekly", defaultSubject: "{expiring} {points} expire soon — use them first", audience: "Members with points expiring within 30 days" },
  dormant:            { name: "We miss you", desc: "Members holding points with no activity for 90 days.", cadence: "monthly", defaultSubject: "Your {balance} {points} are waiting for you", audience: "Dormant members holding points" },
  tier_up:            { name: "You've reached a new tier", desc: "Sent when a member moves up a tier.", cadence: "event", defaultSubject: "Congratulations — you're now {tier}!", audience: "Members on tier change" },
  announcement:       { name: "Announcement", desc: "A one-off blast: new reward, new wheel, double-points weekend.", cadence: "once", defaultSubject: "Something new at {program}", audience: "All subscribed members" },
};

