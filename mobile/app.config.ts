import type { ExpoConfig } from "expo/config";

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const config: ExpoConfig = {
  name: "ORBO",
  slug: "orbo",
  version: "0.0.1",
  scheme: "orbomobile",
  ios: { bundleIdentifier: "ai.orbo.mobile", supportsTablet: true },
  android: { package: "ai.orbo.mobile" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-notifications", { defaultChannel: "orbo" }],
  ],
  extra: { ...(projectId ? { eas: { projectId } } : {}) },
};
export default config;
