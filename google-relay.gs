/* ============================================================
   РЕЛЕ ДЛЯ ОТПРАВКИ ПАЛЕТОВ НА ПОЧТУ ЧЕРЕЗ GOOGLE
   (Google Apps Script)

   Как установить — README.md, раздел 8.
   Коротко:
   1. Открой https://script.google.com → «Новый проект»
   2. Вставь этот код целиком
   3. Впиши свою почту в RECIPIENT и любое слово в TOKEN
   4. Deploy → New deployment → Type: Web app
      → Execute as: Me → Who has access: Anyone
   5. Скопируй URL вида https://script.google.com/macros/s/…/exec
      → вставь в config.js в RELAY_URL, слово — в RELAY_TOKEN
   ============================================================ */

const RECIPIENT = 'ВАША_ПОЧТА@gmail.com'; // куда слать файлы
const TOKEN = 'секретное-слово';          // любое слово, должно совпадать с RELAY_TOKEN в config.js

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) {
      return reply({ ok: false, error: 'Неверный токен' });
    }

    const bytes = Utilities.base64Decode(body.data);
    const blob = Utilities.newBlob(
      bytes,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body.fileName
    );

    MailApp.sendEmail({
      to: RECIPIENT,
      subject: 'Палет ' + body.caption,
      body: 'Палет «' + body.caption + '», кодов: ' + body.count + '\n\nФайл во вложении.',
      attachments: [blob],
    });

    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
