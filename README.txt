EARN ACTIONS + CARD BADGES + THANK-YOU BLOCK

1) Unzip into C:\Users\info\Downloads\rewards-app\ (merge; YES to replace):
     app\routes\proxy.account.subscribe.tsx   (new)
     app\routes\public.program.tsx            (new)
     app\routes\img.$kind.tsx                 (thimble icon)
     extensions\rewards-account\src\RewardsPage.jsx
     extensions\rewards-storefront\assets\rewards.js, rewards.css
     extensions\rewards-storefront\blocks\rewards-embed.liquid
     extensions\rewards-checkout\src\ThankYou.jsx   (new extension — see step 3)

2) git add/commit/push  (backend)

3) Thank-you block:  shopify app generate extension → Checkout UI → rewards-checkout → Preact
   Then follow extensions\rewards-checkout\shopify.extension.toml.SNIPPET.

4) shopify app deploy -c all-about-sewing-rewards

5) Theme editor → App embeds → Rewards widget → "Show 'Earn N points' badge on product cards" (on by default).
   Settings → Checkout → Customize → Thank you page → Add block → Rewards checkout → Save.
