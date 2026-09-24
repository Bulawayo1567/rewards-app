Unzip into C:\Users\info\Downloads\rewards-app\ (merge). Adds:
  app\routes\cron.daily.tsx
  vercel.json          (root of the project — schedules the job daily at 12:00 UTC = 8 am Eastern)

Then in Vercel → Settings → Environment Variables add:
  CRON_SECRET = <any long random string>   (Vercel uses it to authenticate the scheduled call)
