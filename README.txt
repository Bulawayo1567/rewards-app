1) Unzip into C:\Users\info\Downloads\rewards-app\ (merge; YES to replace app\lib\rewards\storefront.server.ts)

   Backend:  app\lib\rewards\account-auth.server.ts (new)
             app\lib\rewards\storefront.server.ts (replaced — adds history + offers)
             app\routes\proxy.account.me.tsx, proxy.account.redeem.tsx, proxy.account.birthday.tsx (new)
   Extension: extensions\rewards-account\src\RewardsPage.jsx (new)

2) DELETE extensions\rewards-account\src\OrderStatusBlock.jsx

3) Edit extensions\rewards-account\shopify.extension.toml as shown in shopify.extension.toml.SNIPPET
   (keep the uid line; change target + module; add network_access). Delete the SNIPPET file after.

4) Restart the dev server (q, then shopify app dev).
