import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "피클볼 코트 예약",
  description: "인도어 피클볼장 통합 예약",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
