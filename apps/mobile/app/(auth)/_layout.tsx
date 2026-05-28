import * as React from "react";
import { Stack } from "expo-router";

// TODO(integrate-auth-redirect): subscribe to supabase.auth.onAuthStateChange
// and Redirect to /(onboarding)/welcome if first-login OR /(app)/feed if returning.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
