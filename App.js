
import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import TabNavigator from './TabNavigator';
import { MoneyProvider } from './moneyContext';

export default function App() {
  return (
    <MoneyProvider>
      <NavigationContainer>
        <TabNavigator />
      </NavigationContainer>
    </MoneyProvider>
  );
}