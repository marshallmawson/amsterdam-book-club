// Plugin to inject build version into index.html
export function injectBuildVersion() {
  return {
    name: 'inject-build-version',
    transformIndexHtml(html) {
      const buildTimestamp = Date.now();
      const versionMeta = `<meta name="app-version" content="${buildTimestamp}">`;
      const versionScript = `<script>window.__BUILD_VERSION__ = ${buildTimestamp};</script>`;
      // Insert version meta tag and script before the closing head tag
      return html.replace('</head>', `  ${versionMeta}\n  ${versionScript}\n</head>`);
    }
  };
}
