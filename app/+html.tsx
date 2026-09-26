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
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
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
@media (prefers-color-scheme: dark) {
  html, body {
    background-color: #0A0F1C;
  }
}
`;
