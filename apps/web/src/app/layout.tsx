import type { ReactNode } from "react";
import "@/styles/globals.css";
import { texts } from "@/content/texts.uz";

export const metadata = { title: texts.appName };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
