import { ScrollViewStyleReset } from 'expo-router/html';

// Expo Router's default root document leaves <html>/<body> with no
// background color at all — just the browser's default white. On
// mobile Chrome, overscroll bounce briefly reveals whatever's behind
// the app's own painted content, so that showed as a white flash at
// the top/bottom of the page regardless of which screen or theme was
// active. This sets it to match app light/dark colors via the OS-level
// prefers-color-scheme, which is the best approximation available at
// static-HTML time (the in-app theme toggle is JS state, not known yet
// when this document is generated).
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>Siqa</title>
        <meta
          name="description"
          content="Siqa — trusted Islamic talks from real scholars, a Muslim marketplace, and causes worth supporting."
        />
        {/* Default link-preview tags. Shared /watch, /gems?videoId, /product,
            /seed and /speaker links get page-specific ones from api/og.js. */}
        <meta property="og:site_name" content="Siqa" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Siqa" />
        <meta
          property="og:description"
          content="Siqa — trusted Islamic talks from real scholars, a Muslim marketplace, and causes worth supporting."
        />
        <meta property="og:image" content="/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />

        {/* Installable web app (PWA). */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0A0F1C" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Siqa" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="format-detection" content="telephone=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
html, body {
  background-color: #FFFFFF;
}
/* A fast flick-scroll past the top or bottom of content triggers the
   browser's own native overscroll UI (Chrome's pull-to-refresh /
   rubber-band bounce) — a browser affordance rendered on top of
   everything, not an app background color, so no background-color fix
   could touch it. react-native-web's ScrollView renders its own nested
   scrolling div with a generated class name, not a stable selector, so
   this targets every element rather than guessing which one actually
   scrolls on a given screen. It only suppresses overscroll-triggered
   browser UI — normal scrolling and layout are unaffected. */
* {
  overscroll-behavior: none;
}
@media (prefers-color-scheme: dark) {
  html, body {
    background-color: #0A0F1C;
  }
}
`;
