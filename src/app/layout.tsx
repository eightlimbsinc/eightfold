import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Eightfold", template: "%s · Eightfold" },
  description: "Eightfold — the agency operating system by 8limbs Inc.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0c1526",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
