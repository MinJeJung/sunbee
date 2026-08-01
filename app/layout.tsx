import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "선비북스 전자책 대시보드", template: "%s · 선비북스 전자책" },
  description: "주제 승인부터 제작, 검수, ISBN, 5사 유통까지 관리하는 전자책 운영 대시보드",
  applicationName: "선비북스 전자책 대시보드",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "선비북스 전자책" }
};

export const viewport: Viewport = { themeColor: "#17251f", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
