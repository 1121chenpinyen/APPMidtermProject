import React from 'react';
import { Modal, View, TextInput, Button, StyleSheet, Text } from 'react-native';

export default function FABDialog({ visible, onClose, text, setText, onSend }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.label}>想說點什麼?</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="輸入訊息..."
            autoFocus
          />
          <View style={styles.buttonRow}>
            <Button title="取消" onPress={onClose} />
            <Button title="傳送" onPress={onSend} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    width: 300,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
  },
  label: {
    fontSize: 18,
    marginBottom: 10,
    fontWeight: 'bold',
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
