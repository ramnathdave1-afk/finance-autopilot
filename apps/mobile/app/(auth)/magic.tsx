import * as React from "react";
import { TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../src/components/Button";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";
import { supabase } from "../../src/lib/supabase";

export default function Magic() {
  const theme = useTheme();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const onSend = async () => {
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "pilot://(auth)/login" }
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bgDefault }}>
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.base }}>
        <Text variant="3xl" weight="semibold">
          Magic link
        </Text>
        {sent ? (
          <Text variant="base" tone="muted">
            Check your inbox — we sent a sign-in link to {email}.
          </Text>
        ) : (
          <>
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
            {err && (
              <Text variant="sm" tone="danger">
                {err}
              </Text>
            )}
            <Button label="Email me a link" onPress={onSend} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
