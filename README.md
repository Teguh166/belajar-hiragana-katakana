# Belajar Hiragana & Katakana

Website untuk belajar menulis Hiragana dan Katakana dengan latihan menulis 10× per huruf dan quiz tebak huruf. Mendukung layar sentuh (touchscreen).

## Fitur

- **Latihan menulis**: Setiap huruf (dasar, tenten, maru) punya target 10 kali latihan. Gambar di canvas dengan jari atau mouse.
- **Progress tersimpan**: Menggunakan localStorage.
- **Suara huruf**: Di modal latihan ada tombol putar suara pengucapan huruf (speech synthesis).
- **Efek suara latihan**: Ada efek suara saat progress +1 dan saat huruf selesai 10/10.
- **Kontrol suara**: Tombol global ON/OFF di header + volume terpisah untuk suara huruf dan efek suara.
- **Feedback visual suara**: Tombol suara huruf punya ikon speaker dan animasi indikator saat suara sedang diputar.
- **Indikator mute otomatis**: Saat suara OFF, ikon berubah ke mode mute (🔇) agar status mudah dikenali.
- **Quiz tebak huruf**: Muncul setelah semua huruf di Hiragana/Katakana selesai 10×. Pilih romaji yang benar dari 4 pilihan (10 soal per ronde).

## Menjalankan lokal

Buka folder ini dengan server statis, misalnya:

```bash
npx serve .
```

Lalu buka di browser (mis. http://localhost:3000).

## Deploy (GitHub Pages)

1. Buat repo baru di GitHub, lalu:

```bash
git init
git add .
git commit -m "Initial commit: Belajar Hiragana & Katakana"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO-NAME.git
git push -u origin main
```

2. Di GitHub: **Settings → Pages → Source**: pilih branch **main**, folder **/ (root)** → Save.  
3. Situs akan live di `https://USERNAME.github.io/REPO-NAME/`.

## Teknologi

HTML, CSS, JavaScript (vanilla). Font: Noto Sans JP, Outfit (Google Fonts).
