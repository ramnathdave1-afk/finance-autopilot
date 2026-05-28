import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Pilot",
  slug: "pilot",
  scheme: "pilot",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  ios: {
    bundleIdentifier: "com.rkv.pilot",
    supportsTablet: true
  },
  android: {
    package: "com.rkv.pilot",
    adaptiveIcon: { backgroundColor: "#0e1014" }
  },
  splash: {
    backgroundColor: "#0e1014",
    resizeMode: "contain"
  },
  plugins: ["expo-router"],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: "TODO(integrate-eas)" }
  }
};

export default config;
