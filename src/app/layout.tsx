import { Alfa_Slab_One, Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const alfaSlab = Alfa_Slab_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-alfa-slab",
});

const barlow = Barlow({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-barlow",
});

const barlowCondensed = Barlow_Condensed({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow-condensed",
});

export const metadata = {
  title: "buwis-brain",
  description: "PH freelancer tax & contributions assistant with citations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${alfaSlab.variable} ${barlow.variable} ${barlowCondensed.variable}`}>
      <body>{children}</body>
    </html>
  );
}
