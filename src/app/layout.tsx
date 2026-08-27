export const metadata = {
  title: "buwis-brain",
  description: "PH freelancer tax & contributions assistant with citations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
