1) Unzip into C:\Users\info\Downloads\rewards-app\ — YES to replace:
     extensions\rewards-storefront\assets\rewards.css
     extensions\rewards-storefront\assets\rewards.js

2) Three small hand edits (each described in its PATCH file):
     prisma\PATCH.txt                       → add pointValueCents to Program, then run the migrate command
     app\routes\SETTINGS-PATCH.txt          → add the "Value of one point" field to Settings
     app\lib\rewards\STOREFRONT-PATCH.txt   → include pointValueCents in the storefront payload

   Delete the three PATCH files afterwards.
