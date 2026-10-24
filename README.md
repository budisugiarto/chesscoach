# chess-coach
Aplikasi web interaktif untuk belajar, berlatih, dan menganalisis catur secara lokal.

# Chess Coach

Aplikasi web latihan dan analisis catur pribadi. Antarmuka berbahasa Indonesia; papan mendukung langkah legal, impor PGN/FEN, navigasi riwayat, dan analisis posisi dengan Stockfish di Web Worker.

## Menjalankan secara lokal

Persyaratan: Node.js 22 dan npm.

```sh
npm install
npm run dev
```

Buka alamat lokal yang dicetak Vite di terminal. Saat pertama kali dijalankan, skrip akan mengunduh Stockfish Lite single-threaded dan teks lisensinya ke `public/engine/`. Aset engine tidak disimpan di Git. Build produksi:

```sh
npm run build
npm run preview
```

Pengunduhan engine memerlukan koneksi internet. Posisi dan PGN yang dimasukkan dianalisis di browser dan tidak dikirim ke server.

## GitHub Codespaces

Repository ini menyertakan konfigurasi `.devcontainer` dengan Node.js 22. Buat Codespace dari repository, tunggu proses `npm install` selesai, lalu jalankan:

```sh
npm run dev -- --host 0.0.0.0
```

Codespaces akan meneruskan port 5173 dan membuka aplikasi. Pengunduhan engine dijalankan saat perintah dev pertama kali dimulai.

## Batasan penggunaan

Aplikasi menerima input PGN/FEN yang ditempel pengguna dan permainan lokal. Aplikasi ini tidak membaca layar, mengambil data game berjalan, terhubung ke situs catur, atau menyediakan overlay/bantuan langkah untuk pertandingan online.

## Lisensi engine

Stockfish.js didistribusikan di bawah GNU General Public License versi 3. Skrip proyek mengambil engine dan teks lisensi dari [rilis Stockfish.js 19.0.1](https://github.com/nmrugg/stockfish.js/tree/v19.0.1). Tinjau `public/engine/Copying.txt` setelah aset engine diunduh, dan patuhi GPLv3 jika mendistribusikan aplikasi beserta engine.
