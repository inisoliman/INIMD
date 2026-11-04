import { Modal } from './Modal'

interface GuideDialogProps {
  onClose: () => void
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl + N', 'ملف جديد'],
  ['Ctrl + O', 'فتح ملف'],
  ['Ctrl + S', 'حفظ'],
  ['Ctrl + Shift + S', 'حفظ باسم'],
  ['Ctrl + W', 'إغلاق التبويب'],
  ['Ctrl + F', 'بحث واستبدال'],
  ['Ctrl + B', 'إظهار/إخفاء الشريط الجانبي'],
  ['Ctrl + Shift + V', 'تبديل المعاينة'],
  ['Ctrl + Alt + P', 'تصدير PDF'],
  ['Ctrl + Alt + W', 'تصدير Word'],
  ['Ctrl + ,', 'الإعدادات']
]

export function GuideDialog({ onClose }: GuideDialogProps): React.ReactElement {
  return (
    <Modal title="دليل الاستخدام" onClose={onClose} width={640}>
      <div className="guide">
        <section>
          <h3>البداية</h3>
          <ul>
            <li>افتح ملفاً من زر «فتح» أو اسحب ملف <code>.md</code> وأفلته على النافذة.</li>
            <li>بعد التركيب يصبح مِداد البرنامج الافتراضي لملفات <code>.md</code>، ويمكنك فتحها بنقر مزدوج.</li>
            <li>اختر طريقة العرض: تحرير فقط، مقسوم، أو معاينة فقط من شريط الأدوات.</li>
          </ul>
        </section>

        <section>
          <h3>دعم العربية</h3>
          <ul>
            <li>يُكتشف اتجاه المستند تلقائياً من أول حرف؛ ويمكنك تثبيته بزر الاتجاه في الشريط.</li>
            <li>كتل الكود تبقى دائماً من اليسار إلى اليمين حتى داخل مستند عربي.</li>
            <li>غيّر الخط وحجمه وتباعد الأسطر من الإعدادات، ويظهر التأثير فوراً في المعاينة والتصدير.</li>
            <li>التصحيح الإملائي يستخدم قواميس ويندوز (العربية والإنجليزية).</li>
          </ul>
        </section>

        <section>
          <h3>التصدير</h3>
          <ul>
            <li><strong>PDF:</strong> يحافظ على التنسيق العربي والجداول والصور، مع أرقام صفحات اختيارية.</li>
            <li><strong>Word:</strong> ينشئ ملف <code>.docx</code> حقيقياً بأنماط عناوين وجداول واتجاه RTL مضبوط.</li>
          </ul>
        </section>

        <section>
          <h3>اختصارات لوحة المفاتيح</h3>
          <div className="shortcut-grid">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys} className="shortcut-row">
                <kbd dir="ltr">{keys}</kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3>صيغة Markdown المدعومة</h3>
          <p className="guide-note">
            عناوين، قوائم، جداول، اقتباسات، أكواد، روابط، صور، مهام، حواشي سفلية، ونص عريض/مائل. يمكنك أيضاً كتابة HTML
            بسيط داخل الملف وسيُعرض بأمان.
          </p>
        </section>
      </div>
    </Modal>
  )
}
