# UnElektr

Elektr tarmog'i uchun Experience Builder widgeti: 8 ta trace, tarmoqni tekshirish va tahrirlash.
**Mustaqil ishlaydi** — tashqi server (Python) kerak emas. Ma'lumot **Feature Layer**dan o'qiladi va unga
`applyEdits` bilan yoziladi; barcha hisob-kitob widget ichidagi dvigatelda (`src/runtime/dvigatel`).

Dvigatel avvalgi `UN_Dvigatel` Python serverining (graf.py, trace.py, xato_tekshir.py, tahrir.py) TypeScript
nusxasi. Bir xil Feature Layer ma'lumotida ikkalasining natijalari solishtirilgan: 95 ta tekshiruv xatosi to'liq
mos, 741 ta tahrir so'rovi bir xil javob beradi (farq faqat teng masofadagi tanlovlar va ro'yxatlar tartibida),
1653 ta trace dan 1628 tasi bir xil. Qolgan 25 tasi — qurilmadan (TP, PS) downstream: Python unga kelayotgan
(yuqoridagi) liniyani ham natijaga qo'shib yuborardi, bu xato TS nusxasida tuzatilgan.

Podstansiya butunligicha tanlansa (UN_Dvigatel server.py dagi yangi qoida): Downstream, Subnetwork va Subnetwork
Controllers faqat uning O'rta terminalidan, Upstream — faqat Yuqori terminalidan boshlanadi. Shunda PS dan
downstream 35/110 kV tarmoqqa, upstream esa 6/10 kV halqaga chiqib ketmaydi.

Trace lar UN o'zi yozgan maydonlar bilan ham tekshirilgan: har bir liniyadan Subnetwork nomi va tarkibi UN
`SUBNETWORKNAME` bilan, ulanganlik `ISCONNECTED` bilan mos (farq faqat UN da Update Subnetwork qilinmagan,
qiymati eskirgan ikki joyda: SN_PS_594 va SN_PS_7 dagi ustma-ust ulangan liniyalar).

## Sahifalar

| Sahifa | Vazifasi |
|---|---|
| Xarita | To'liq ko'rinish, tanlovga yaqinlashish, fon xarita, tanlovni tozalash, atribut jadvali (saralash, filtr, faqat tanlanganlar, hammasini tanlash, CSV) |
| Utility Network | 8 ta trace (Downstream, Upstream, Subnetwork, Subnetwork Controllers, Connected, Loops, Shortest Path, Isolation), boshlang'ich nuqta / to'siq / yo'l oxiri, "Yangilash" (Feature Layerdan qayta yuklash) |
| Tahrir | Liniya chizish, qurilma qo'yish, qirqish, ko'chirish, atributlar, o'chirish, ortga qaytarish, tarix |
| Tekshiruv | FIZ1 / OGOH2 xatolarini xaritada ko'rsatish, xatolar jadvali |

## Oqim

1. Widget Feature Layerlarni to'liq o'qiydi (maxRecordCount dan oshsa ham) va dvigatelga beradi (`sync`) —
   graf brauzer xotirasida quriladi.
2. Trace va tekshiruv — xotiradagi graf ustida.
3. Tahrir — ikki bosqich:
   - `sinov: true` — dvigatel oldindan ko'rsatadi (bo'laklar uzunligi, ulanishlar, terminallar, forma);
   - saqlash — dvigatel o'zgarishni jadvallar nusxasida qo'llab tekshiradi (yangi UN/FIZ xato bo'lsa rad etadi,
     admin "Baribir saqlash" qila oladi) va **o'zgarishlar to'plamini** (`fl_ozgarishlar`) qaytaradi.
     Widget uni Feature Layerga yozadi (`fl-edit.ts`), teskari to'plamni tarixga qo'shadi va qayta yuklaydi.
4. Ortga qaytarish — tarixdan oxirgi teskari to'plam olinadi va Feature Layerga yoziladi.

Tahrir formasi Feature Layer maydonlaridan quriladi: Feature Layerda yo'q maydon formada ko'rinmaydi va
saqlanmaydi. Yangi maydon kerak bo'lsa — uni Feature Layerga qo'shing (ArcGIS Pro yoki Portal → Data → Fields).

## Sozlash

1. Experience ga **UnElektr** widgetini qo'ying (ixtiyoriy: **Map** widgeti ham)
2. Sozlamada **Select data** — liniya va qurilma Feature Layerlarini tanlang
3. Ixtiyoriy: xarita widgeti, **Tarix jadvali**, rol
   (`koruvchi` — faqat ko'radi va trace qiladi, `muharrir` — tahrirlaydi, `admin` — "Baribir saqlash" ham)

## Tarix jadvali

Sozlamada "Tarix jadvali" bo'sh bo'lsa, tahrir tarixi har bir foydalanuvchining **brauzerida** saqlanadi
(shu brauzer va shu liniya qatlami uchun, oxirgi 300 ta o'zgarish). Hamma uchun umumiy tarix kerak bo'lsa,
Feature Service ichiga jadval (table, geometriyasiz) qo'shing va uning URL ini (`…/FeatureServer/N`)
sozlamaga yozing. Jadval ochilmasa yoki maydonlari yetishmasa, widget ogohlantiradi va brauzerga qaytadi.

Jadval maydonlari (nomlari aynan shunday, katta-kichik harf farqi yo'q):

| Maydon | Turi | Uzunlik |
|---|---|---|
| GURUH | Integer | |
| VAQT | String | 19 |
| FOYDALANUVCHI | String | 128 |
| AMAL | String | 32 |
| QATLAM | String | 16 |
| OBYEKT_GID | String | 38 |
| NOMI | String | 255 |
| MAYDON | String | 64 |
| ESKI | String | 2000 |
| YANGI | String | 2000 |
| BEKOR | Short (SmallInteger) | |
| MALUMOT | String | 1000000 |

`MALUMOT` da o'zgarishning teskari to'plami (JSON, geometriyasi bilan) saqlanadi — uzun liniyalar uchun katta
bo'lishi mumkin, shuning uchun uzunligini kamaytirmang. Tahrir qiladigan foydalanuvchilar jadvalga yoza olishi kerak.

Feature Layerga yozish rad etilgan o'zgarishlar ("Feature Layerga yuborish" kutayotganlar) har doim brauzerda saqlanadi.

## Cheklovlar

- Ko'p qismli (multipart) liniyalarning geometriyasini o'zgartirib bo'lmaydi (faqat birinchi qismi bilan ishlanadi).
- O'chirilib keyin ortga qaytarilgan obyekt yangi GLOBALID oladi (Feature Layer beradi); tarixdagi havolalar
  avtomatik yangilanadi.
- Rol widget sozlamasidan olinadi; foydalanuvchi nomi ExB dan (tarix uchun).
- Koordinatalar metrda hisoblanadi (UTM 42N, EPSG:32642) — O'zbekiston hududi uchun.
