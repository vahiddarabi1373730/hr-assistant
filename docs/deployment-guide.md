# راهنمای کامل استقرار HR Assist

این راهنما روند اجرای HR Assist را ثبت می‌کند: توسعه روی `localhost`، PostgreSQL محلی، دیتابیس Neon، اجرای FastAPI روی Render و انتشار frontend روی Netlify.

## معماری نهایی

```text
مرورگر → Netlify frontend → proxy مسیرهای /api و /auth → Render FastAPI → Neon PostgreSQL
```

| بخش | آدرس |
| --- | --- |
| Frontend | https://hr-assist-137132cc.netlify.app |
| Backend | https://hr-assist-backend-4dmd.onrender.com |
| Health check | https://hr-assist-backend-4dmd.onrender.com/healthz |
| Repository | https://github.com/vahiddarabi1373730/hr-assist |

## لوکال و production

در توسعه، `backend/.env` به PostgreSQL لوکال اشاره می‌کند:

```env
HR_MIGRATION_DATABASE_URL=postgresql+asyncpg://postgres:<local-password>@127.0.0.1:5432/hr_dev
HR_APP_DATABASE_URL=postgresql+asyncpg://hr_app:hr_app_dev@127.0.0.1:5432/hr_dev
HR_COOKIE_SECURE=false
```

در production، همین نام متغیرها در Environment سرویس Render به Neon اشاره می‌کنند. فایل `backend/.env` نباید commit یا upload شود.

`HR_MIGRATION_DATABASE_URL` اتصال privileged برای Alembic است و باید hostname مستقیم Neon، بدون `-pooler`، داشته باشد. `HR_APP_DATABASE_URL` اتصال برنامه با role محدود `hr_app` است و می‌تواند hostname دارای `-pooler` داشته باشد.

```env
HR_MIGRATION_DATABASE_URL=postgresql+asyncpg://neondb_owner:<owner-password>@<direct-host>/neondb?ssl=require
HR_APP_DATABASE_URL=postgresql+asyncpg://hr_app:<app-password>@<pooler-host>/neondb?ssl=require
HR_APP_DB_PASSWORD=<app-password>
HR_COOKIE_SECURE=true
```

رمزها را در چت، Git یا frontend قرار ندهید. رمزهایی که در روند راه‌اندازی افشا شده‌اند باید rotate شوند.

## راه‌اندازی Neon

1. در Neon یک project و database بسازید.
2. از بخش **Connect**، URL مستقیم را برای migration و URL pooled را برای برنامه بردارید.
3. scheme را به `postgresql+asyncpg://` تبدیل کنید.
4. `sslmode=require` را به `ssl=require` تبدیل کنید.
5. پارامتر `channel_binding=require` را حذف کنید؛ asyncpg پروژه آن را قبول نمی‌کند.
6. برای role `hr_app` رمز قوی تعیین کنید و همان را در URL برنامه و `HR_APP_DB_PASSWORD` قرار دهید.

اجرای migration:

```powershell
cd backend
.venv\Scripts\python.exe -m alembic upgrade head
```

وضعیت موفق migration باید `0009 (head)` باشد. migration شمارهٔ 0002 role `hr_app` را با least privilege و RLS می‌سازد.

## استقرار Render

فایل `render.yaml` سرویس Docker با نام `hr-assist-backend` را تعریف می‌کند. به دلیل محدودیت پلن رایگان، migration داخل فرمان شروع Docker اجرا می‌شود:

```text
alembic upgrade head && fastapi run app/main.py --host 0.0.0.0 --port $PORT
```

مراحل داشبورد:

1. **New → Blueprint** را انتخاب کنید.
2. repository `vahiddarabi1373730/hr-assist` و branch `main` را انتخاب کنید.
3. مسیر Blueprint را `render.yaml` بگذارید.
4. متغیرهای `HR_MIGRATION_DATABASE_URL`، `HR_APP_DATABASE_URL`، `HR_APP_DB_PASSWORD` و `HR_GROQ_API_KEY` را وارد کنید.
5. Blueprint را deploy کنید و منتظر وضعیت `Live` بمانید.
6. مسیر `/healthz` باید JSON زیر را برگرداند:

```json
{"status":"ok"}
```

سرویس رایگان Render پس از بی‌ترافیکی sleep می‌کند و فایل‌سیستم آن دائمی نیست.

## اتصال Netlify

فایل `frontend/public/_redirects` باید این قوانین را قبل از fallback داشته باشد:

```text
/auth/* https://hr-assist-backend-4dmd.onrender.com/auth/:splat 200!
/api/* https://hr-assist-backend-4dmd.onrender.com/api/:splat 200!
/healthz https://hr-assist-backend-4dmd.onrender.com/healthz 200!
/* /index.html 200
```

ساخت و انتشار frontend:

```powershell
cd frontend
npm run build
cd ..
npx --yes netlify-cli deploy --site 1e841b4a-ede2-4201-b3a4-d20fd30087f9 --dir frontend/dist --no-build --prod
```

## تست نهایی

1. `GET /healthz` از دامنهٔ Netlify باید HTTP 200 و JSON سلامت بدهد.
2. `GET /api/me` در حالت logout باید HTTP 401 و JSON بدهد، نه HTML.
3. signup، login، باقی ماندن session و logout را بررسی کنید.
4. یک رزومهٔ آزمایشی upload و خلاصهٔ AI را تست کنید.

## خطاهای مهم حل‌شده

- `preDeployCommand is not supported for free tier services`: migration به Docker CMD منتقل شد.
- `channel_binding` در asyncpg پشتیبانی نشد: از URL حذف شد.
- رمز `hr_app_dev` در Neon ناامن تشخیص داده شد: رمز قوی برای `hr_app` تنظیم شد.
- migration با pooler کند شد: migration با hostname مستقیم اجرا شد.

آخرین وضعیت تأییدشده: backend روی Render با health check موفق، frontend روی Netlify با proxy فعال و دیتابیس Neon روی revision `0009`.
