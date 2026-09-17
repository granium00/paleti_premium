/* ============================================================
   РЕЛЕ ДЛЯ ОТПРАВКИ ПАЛЕТОВ НА ПОЧТУ
   (Google Apps Script — сервера Google не видят блокировок)

   Как установить — README.md, раздел 8.
   Коротко:
   1. Открой https://script.google.com → «Новый проект»
   2. Вставь этот код целиком
   3. Заполни RECIPIENT (своя почта) и TOKEN (слово-пароль)
   4. Deploy → New deployment → Type: Web app
      → Execute as: Me → Who has access: Anyone
   5. URL вида …/exec вставь в config.js в RELAY_URL
   ============================================================ */

const RECIPIENT = 'ВАША_ПОЧТА@gmail.com'; // куда слать письма

/* слово-пароль — должно совпадать с RELAY_TOKEN в config.js */
const TOKEN = 'granium00';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) {
      return reply({ ok: false, error: 'Неверный токен' });
    }

    const bytes = Utilities.base64Decode(body.data);
    const blob = Utilities.newBlob(bytes, XLSX_MIME, body.fileName);

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
