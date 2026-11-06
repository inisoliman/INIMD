// يمنع ظهور نافذة الكونسول (cmd) خلف التطبيق في نسخة الإنتاج.
// بدونه يُبنى الملف التنفيذي كتطبيق كونسول فيفتح ويندوز نافذة سوداء.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    inimd_lite_lib::run()
}
