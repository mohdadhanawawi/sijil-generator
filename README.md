# Sijil Generator

Sistem jana sijil pukal (bulk certificate generator) — muat naik satu
templat sijil, masukkan senarai nama, jana sijil untuk semua orang sekali
gus. Konsepnya macam Canva bulk certificates atau Autocrat (Google Sheets),
tapi semuanya berjalan terus dalam pelayar (client-side `<canvas>`) — tiada
server, tiada database, tiada perkhidmatan luar diperlukan.

## Ciri-ciri

- Muat naik templat sijil sebagai imej (JPG/PNG) atau PDF (muka surat
  pertama sahaja digunakan, diconvert jadi imej terus dalam pelayar)
- Klik terus pada sijil untuk letak kedudukan nama — pilih fon, saiz, dan
  warna teks, dengan pratonton langsung
- Senarai nama: taip terus (satu nama satu baris) atau muat naik fail
  CSV/TXT (nama diambil dari lajur pertama)
- Jana sijil untuk semua nama sekali gus, muat turun sebagai satu fail ZIP
  (PNG resolusi penuh templat asal) — atau muat turun satu-satu
- Templat (imej + kedudukan + fon) disimpan automatik dalam
  `localStorage` pelayar, jadi tak hilang bila refresh

## Setup

```bash
npm install
npm run dev
```

Buka [http://localhost:5173](http://localhost:5173).

## Build untuk production

```bash
npm run build
npm run preview   # untuk uji build production secara tempatan
```

Output statik ada dalam `dist/` — boleh deploy terus ke mana-mana hosting
statik (Vercel, Netlify, Cloudflare Pages, GitHub Pages, dll.), tiada env
var atau backend diperlukan.

## Struktur Projek

```
src/
  App.tsx                Studio sijil (upload templat, letak nama, senarai nama, jana ZIP)
  certificateRender.ts   Lukis nama pada templat sijil (canvas)
  pdfTemplate.ts         Convert muka surat pertama PDF templat jadi imej (pdf.js, lazy-loaded)
  parseNames.ts          Parse senarai nama dari teks/fail CSV
  fonts.ts               Pilihan fon untuk teks sijil
  styles.css             Reka bentuk halaman
index.html                Termasuk <link> Google Fonts (Playfair Display, Great Vibes, Montserrat)
```

## Nota

- Fail templat & senarai nama tidak dihantar ke mana-mana server — semua
  pemprosesan (baca imej, lukis nama, jana ZIP) berlaku dalam pelayar
  pengguna sendiri.
- Fon Google Fonts (Playfair Display, Great Vibes, Montserrat) perlukan
  sambungan internet untuk dimuatkan; Georgia (fon sistem) sentiasa
  berfungsi tanpa internet.
