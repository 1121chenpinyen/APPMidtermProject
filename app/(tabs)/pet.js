import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useMoney } from '../../context/moneyContext';

export default function PetPage() {
  const { money } = useMoney();
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Pet 分頁</Text>
      <Text style={{ color: '#ffb300', fontWeight: 'bold', fontSize: 20, marginTop: 16 }}>金幣：{money}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
