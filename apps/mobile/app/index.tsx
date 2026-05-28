import * as React from "react";
import { Redirect } from "expo-router";

// Entry: jump into the auth gate. The auth layout decides where to send the
// user from there (login vs. onboarding vs. main app) based on session state.
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
