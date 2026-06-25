import type { AppProps } from 'next/app';
// DEPRECATED (for upgrade testing): `@next/font` was merged into `next/font`
// in Next 13.2 and the `@next/font` package is removed in later versions.
// The `built-in-next-font` codemod rewrites this import.
import { Inter } from '@next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={inter.className}>
      <Component {...pageProps} />
    </main>
  );
}
