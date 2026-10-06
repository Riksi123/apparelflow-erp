import "./globals.css";

export const metadata = {
  title: "ApparelFlow | Production Batch Verification",
  description: "Production operations with a server-enforced cutting quality gate.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
