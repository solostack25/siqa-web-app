// Native fingerprint settings for EAS Update (app.json runtimeVersion policy "fingerprint").
// Skip the app's version / build numbers so a version bump alone (e.g. 2.1.0 → 2.1.1
// for a new store build) doesn't change the fingerprint and cut installed apps off
// from over-the-air updates. Real native changes (packages, plugins, permissions)
// still change it.
/** @type {import('expo/fingerprint').Config} */
const { SourceSkips } = require('expo/fingerprint');

module.exports = {
  sourceSkips: SourceSkips.ExpoConfigVersions,
};
