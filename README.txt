SPAM FLAGGING + EMAIL CAMPAIGNS — includes batches 19 and 20 too (self-contained).

1) Unzip into C:\Users\info\Downloads\rewards-app\ (merge; YES to replace all).
2) Follow prisma\PATCH.txt: add the schema lines, run `npx prisma migrate dev --name spam_and_email`.
3) Vercel env vars: RESEND_API_KEY, EMAIL_FROM, APP_SECRET (see PATCH.txt). Redeploy after adding.
4) git add/commit/push.  Then `shopify app deploy -c all-about-sewing-rewards` for the account page.
5) In the app: Members → Suspicious → "Rescan all members".
