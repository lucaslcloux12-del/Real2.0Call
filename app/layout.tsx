import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "2.0 Call",
  description: "Melhor que o Google Meet – feito pelo Lucas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
