import './globals.css'

export const metadata = {
  title: 'Outside Insiders - Discover Public Recreation Spaces',
  description: 'Mobile first platform to discover public recreation spaces',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏞️</text></svg>',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

