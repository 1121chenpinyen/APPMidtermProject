import { Stack } from 'expo-router';
import { MoneyProvider } from '../context/moneyContext';

export default function RootLayout() {
  return (
    <MoneyProvider>
        <Stack>
        {/* 加上這一行，明確告訴它先去找 (tabs) 資料夾 */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
    </MoneyProvider>
  );
}
