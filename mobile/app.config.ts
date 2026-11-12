import type { ExpoConfig } from "expo/config";

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const config: ExpoConfig = {
  name: "ORBO",
  slug: "orbo",
  version: "0.1.6",
  scheme: "orbo",
  icon: "./assets/images/orbo_diya_ios_1024.png",
  splash: {
    image: "./assets/images/orbo_diya_android_512.png",
    resizeMode: "contain",
    backgroundColor: "#080F14",
  },
  ios: { bundleIdentifier: "ai.orbo.mobile", supportsTablet: true },
  android: {
    package: "ai.orbo.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/images/orbo_diya_android_512.png",
      backgroundColor: "#080F14",
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-notifications", { defaultChannel: "orbo" }],
  ],
  extra: { ...(projectId ? { eas: { projectId } } : {}) },
};
export default config;
