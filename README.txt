INTEGRATIONS — Judge.me review points, Mailchimp merge-field sync (newsletter award already live via customers/update).

1) Unzip into C:\Users\info\Downloads\rewards-app\ (merge; YES to replace customers.server.ts and app.settings.tsx).
2) prisma\PATCH.txt → add the 4 Program fields → npx prisma migrate dev --name integrations
3) git add/commit/push.
4) App → Settings → Integrations: copy the Judge.me webhook URL into Judge.me (Settings → Integrations → Webhooks, event review/published);
   paste Mailchimp API key + audience ID, switch sync on, Save (it verifies and creates REWARDPTS / REWARDTIER).
