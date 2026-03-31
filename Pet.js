import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function Pet() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Pet 分頁</Text>
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