import * as React from "react";
import { TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../src/components/Button";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";
import { supabase } from "../../src/lib/supabase";

export default function Signup() {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const onSubmit = async () => {
    setErr(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setErr(error.message);
      return;
    }
    router.replace("/(onboarding)/welcome");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bgDefault }}>
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.base }}>
        <Text variant="3xl" weight="semibold">
          Create your account.
        </Text>
        <Text variant="base" tone="muted">
          7-day free trial. Cancel any time.
        </Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={theme.colors.fgSubtle}
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
          placeholder="Password (12+ chars)"
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
        <Button label="Continue" onPress={onSubmit} />
      </View>
    </SafeAreaView>
  );
}
