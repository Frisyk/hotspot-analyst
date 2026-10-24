import './globals.css';

export const metadata = {
  title: 'Titik Api — Pantau Hotspot Kalimantan',
  description: 'Peta interaktif hotspot NASA FIRMS & KLHK SIPONGI untuk Kalimantan: ratusan ribu titik dirender di GPU, animasi per jam, dan medan 3D.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
