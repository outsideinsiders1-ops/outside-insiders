import './globals.css'

export const metadata = {
  title: 'Outside Insiders - Discover Public Recreation Spaces',
  description: 'Mobile first platform to discover public recreation spaces',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

