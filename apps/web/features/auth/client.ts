"use client";

export { AuthProvider, useAuth } from "./components/auth-provider";
export { AuthScreen } from "./components/auth-screen";
export { AuthEntryScreen } from "./components/auth-entry-screen";
export { AuthPreviewScreen } from "./components/preview/auth-preview-screen";
export { SignupScreen } from "./components/signup/signup-screen";
export { safeReturnPath } from "./lib/return-path";

export { isFirstSetupComplete, firstSetupPath } from "./lib/first-setup";
