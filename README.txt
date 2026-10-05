ACCOUNT PAGE (to the Smile-layout brief) — unzip into C:\Users\info\Downloads\rewards-app\ (merge; YES to replace):

  extensions\rewards-account\src\RewardsPage.jsx   (config.js untouched)
  app\routes\img.$kind.tsx                          (adds /img/tape, /img/sicon, banner subtitle)
  app\lib\rewards\storefront.server.ts              (adds signup/newsletter flags to the payload)

Two deploys:
  1) git add/commit/push                         → Vercel (backend + artwork)
  2) shopify app deploy -c all-about-sewing-rewards → the account extension
