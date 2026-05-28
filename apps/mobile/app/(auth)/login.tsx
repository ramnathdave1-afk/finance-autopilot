import * as React from "react";
import { TextInput, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../src/components/Button";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";
import { supabase } from "../../src/lib/supabase";

export default function Login() {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onSubmit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErr(error.message);
        return;
      }
      router.replace("/(app)/feed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bgDefault }}>
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.base, flex: 1 }}>
        <Text variant="3xl" weight="semibold">
          Welcome back.
        </Text>
        <Text variant="base" tone="muted">
          Sign in to Pilot.
        </Text>
        <TextInput
          accessibilityLabel="Email"
          placeholder="you@example.com"
          placeholderTextColor={theme.colors.fgSubtle}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{
            color: theme.colors.fgDefault,
            borderColor: theme.colors.borderStrong,
            borderWidth: 1,
            borderRadius: theme.radii.md,
            padding: theme.spacing.md
          }}
        />
        <TextInput
          accessibilityLabel="Password"
          placeholder="Password"
          placeholderTextColor={theme.colors.fgSubtle}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={{
            color: theme.colors.fgDefault,
            borderColor: theme.colors.borderStrong,
            borderWidth: 1,
            borderRadius: theme.radii.md,
            padding: theme.spacing.md
          }}
        />
        {err && (
          <Text variant="sm" tone="danger">
            {err}
          </Text>
        )}
        <Button label={loading ? "Signing in…" : "Sign in"} onPress={onSubmit} disabled={loading} />
        <View style={{ flexDirection: "row", gap: theme.spacing.base, marginTop: theme.spacing.sm }}>
          <Link href="/(auth)/signup">
            <Text variant="sm" tone="accent">
              Create account
            </Text>
          </Link>
          <Link href="/(auth)/magic">
            <Text variant="sm" tone="muted">
              Email me a link
            </Text>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
