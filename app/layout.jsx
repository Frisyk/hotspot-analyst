import './globals.css';

export const metadata = {
  title: 'Fire Hotspot Visualizer | Kalimantan Monitoring',
  description: 'Interactive OpenLayers map visualizing FIRMS & SIPONGI fire hotspot alerts with date-time hour filtering and dynamic date-based color coding.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
