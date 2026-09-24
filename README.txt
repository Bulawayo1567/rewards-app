Unzip into C:\Users\info\Downloads\rewards-app\ (merge).

Backend (new):
  app\lib\rewards\campaigns.server.ts
  app\routes\proxy.campaign.tsx, proxy.play.tsx
  app\routes\app.campaigns._index.tsx, app.campaigns.$id.tsx
Theme extension (new):
  extensions\rewards-storefront\blocks\rewards-popup.liquid
  extensions\rewards-storefront\assets\popup.js, popup.css

Nav: in app\routes\app.tsx add inside <s-app-nav>, after the Import line:
        <s-link href="/app/campaigns">Campaigns</s-link>
