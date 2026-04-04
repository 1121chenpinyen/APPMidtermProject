import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export default function MessageModal({ visible, onClose, message, onReply }) {
  const [replyText, setReplyText] = useState('');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>留言內容</Text>
          <Text style={styles.content}>{message}</Text>
          <TextInput
            style={styles.input}
            placeholder="輸入回覆內容"
            value={replyText}
            onChangeText={setReplyText}
          />
          <View style={styles.btnRow}>
            <TouchableOpacity onPress={onClose} style={styles.btn}>
              <Text style={{ color: '#4630EB' }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                onReply(replyText);
                setReplyText('');
                onClose();
              }}
              style={[styles.btn, { backgroundColor: '#4630EB' }]}
            >
              <Text style={{ color: '#fff' }}>傳送</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  dialog: { width: 280, backgroundColor: '#fff', borderRadius: 12, padding: 24, alignItems: 'center' },
  title: { fontWeight: 'bold', fontSize: 18, marginBottom: 10 },
  content: { marginBottom: 16, textAlign: 'center' },
  input: { width: '100%', borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, marginBottom: 16 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  btn: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 6, marginHorizontal: 4 },
});
