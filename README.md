# INIMD — محرر Markdown عربي لويندوز

**INIMD** برنامج سطح مكتب خفيف وعربي أولاً لفتح ملفات Markdown وتحريرها ومعاينتها، مع تصدير مباشر إلى **PDF** و**Word (docx)** بدون إنترنت وبدون أي برامج خارجية.

> **تطوير:** INI — للتواصل: [ibrahim.noshy@hotmail.com](mailto:ibrahim.noshy@hotmail.com)

![أيقونة INIMD](build/icons/app-256.png)

## المزايا

- **ربط تلقائي بملفات `.md` و`.markdown`** عند التركيب: نقرة مزدوجة من مستكشف ويندوز تفتح الملف في INIMD، مع عنصر «فتح بواسطة».
- **دعم عربي كامل**: كشف اتجاه تلقائي (RTL/LTR)، تبديل يدوي لكل ملف، خطوط عربية، تباعد أسطر مريح، وعزل ثنائي الاتجاه للأكواد والروابط.
- **تحرير ومعاينة**: عرض مقسوم بمزامنة تمرير، أو تحرير فقط، أو معاينة فقط، مع فهرس عناوين جانبي وقائمة ملفات حديثة.
- **محرر CodeMirror 6**: تمييز صياغة Markdown، إكمال تلقائي، بحث واستبدال بواجهة عربية، حزم كود، تراجع/إعادة.
- **تصدير PDF**: بجودة الطباعة، مقاسات A4/Letter، هوامش قابلة للضبط، أرقام صفحات اختيارية، جداول وصور ونص عربي متصل.
- **تصدير Word**: ملف `.docx` حقيقي بأنماط عناوين وجداول وقوائم، مع ضبط اتجاه RTL وخصائص `w:rtl` للنصوص العربية.
- **حفظ تلقائي** اختياري، تنبيه التغييرات غير المحفوظة، استرجاع الملف عند تغيّره خارجياً.
- **ثيمات**: فاتح/داكن/تلقائي، وأحجام خطوط قابلة للضبط.
- **أمان**: عزل سياق (`contextIsolation`)، sandbox، تعطيل `nodeIntegration`، وتنقية HTML الناتج عبر DOMPurify.
- يعمل **دون اتصال بالإنترنت** بالكامل.

## لقطات

| الواجهة | المعاينة العربية |
| --- | --- |
| ![الواجهة](docs/screenshot-main.png) | ![المعاينة](docs/screenshot-preview.png) |

| الوضع الداكن |
| --- |
| ![الوضع الداكن](docs/screenshot-dark.png) |

## نماذج المخرجات

مخرجات حقيقية وُلّدت من [`docs/sample-ar.md`](docs/sample-ar.md):

- [`docs/samples/inimd-sample.pdf`](docs/samples/inimd-sample.pdf) — صفحتان بترقيم صفحات وجدول وصورة.
- [`docs/samples/inimd-sample.docx`](docs/samples/inimd-sample.docx) — مستند Word باتجاه RTL وأنماط عناوين.

## التشغيل للتطوير

المتطلبات: ويندوز 10/11، Node.js 20 أو أحدث.

```bash
npm install
npm run dev
```

## البناء والتوزيع

```bash
# بناء ملفات التطبيق
npm run build

# فحص الأنواع
npm run typecheck

# اختبار آلي خاطف (يولّد PDF وWord في مجلد مؤقت)
npm run selftest

# اختبار واجهة كامل عبر Playwright: فتح ملف عربي، تحرير، حفظ، تصدير PDF وWord
npm run check:ui

# التحقق من نسخة التثبيت المبنية في release/win-unpacked
npm run check:packaged

# إعادة توليد نماذج المخرجات في docs/samples
npm run sample:export

# مثبّت NSIS للمستخدم الحالي (بدون صلاحيات مدير)
npm run dist

# نسخة محمولة (بدون تركيب)
npm run dist:portable
```

تجد المخرجات في مجلد `release/`:

- `INIMD-Setup-1.0.0.exe` — مثبّت عادي يسجّل ربط ملفات `.md`.
- `INIMD-Portable-1.0.0.exe` — نسخة محمولة.

> **ربط ملفات `.md`:** يسجّل المثبّت INIMD كبرنامج لفتح ملفات Markdown، لكن ويندوز 10/11 قد يحتفظ بالبرنامج الافتراضي السابق. لتثبيته افتراضياً: انقر بالزر الأيمن على أي ملف `.md` ← **فتح باستخدام** ← **اختيار تطبيق آخر** ← اختر **INIMD** ← **دائماً**.

### ملاحظة حول SmartScreen

النسخة غير موقّعة رقمياً، لذا قد يعرض ويندوز تحذير «Windows protected your PC» عند أول تشغيل. اختر **More info → Run anyway**. لإزالة التحذير يلزم شهادة توقيع كود.

## الاختصارات

| الاختصار | الوظيفة |
| --- | --- |
| `Ctrl + N` | ملف جديد |
| `Ctrl + O` | فتح ملف |
| `Ctrl + S` | حفظ |
| `Ctrl + Shift + S` | حفظ باسم |
| `Ctrl + W` | إغلاق التبويب |
| `Ctrl + F` | بحث واستبدال |
| `Ctrl + B` | الشريط الجانبي |
| `Ctrl + Shift + V` | تبديل المعاينة |
| `Ctrl + Alt + P` | تصدير PDF |
| `Ctrl + Alt + W` | تصدير Word |
| `Ctrl + ,` | الإعدادات |

## بنية المشروع

```
src/
  main/            عملية Electron الرئيسية
    index.ts       النافذة، القائمة، IPC، ربط الملفات، بروتوكول الصور
    docx.ts        محوّل Markdown → docx مع دعم RTL
    pdf.ts         تصدير PDF عبر printToPDF
    files.ts       قراءة الملفات وترميزاتها
    store.ts       الإعدادات والملفات الحديثة
  preload/         جسر آمن (contextBridge)
  renderer/        واجهة React
    src/
      components/  الواجهة: المحرر، المعاينة، التبويبات، الإعدادات…
      lib/         markdown، print، المسارات، الإحصاءات
      styles/      CSS
  shared/          أنواع مشتركة
build/             الأيقونات وإعدادات المثبّت
scripts/           توليد الأيقونات والاختبارات الآلية
```

## التقنيات

Electron · electron-vite · React 19 · TypeScript · CodeMirror 6 · markdown-it · highlight.js · DOMPurify · docx · electron-builder

## النشر على GitHub

المستودع خاص (private) باسم `INIMD` على حساب `inisoliman`. لنشره من جهاز آخر:

```bash
gh auth login
```

ثم من مجلد المشروع:

```bash
git init
git add .
git commit -m "INIMD: محرر Markdown عربي لويندوز مع تصدير PDF وWord"
git branch -M main
gh repo create INIMD --private --source=. --remote=origin --push
```

لإرفاق المثبّت والنسخة المحمولة بإصدار على GitHub:

```bash
gh release create v1.0.0 "release/INIMD-Setup-1.0.0.exe" "release/INIMD-Portable-1.0.0.exe" --title "INIMD 1.0.0" --notes "الإصدار الأول: محرر Markdown عربي مع تصدير PDF وWord."
```

## تطوير

طُوِّر بواسطة **INI**.

- البريد: [ibrahim.noshy@hotmail.com](mailto:ibrahim.noshy@hotmail.com)

## الترخيص

MIT — راجع ملف [LICENSE](LICENSE).

