import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, SafeAreaView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import FABDialog from './FABDialog';
import { db } from './firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';

export default function Home() {
  const [text, setText] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "chat"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = [];
      querySnapshot.forEach((doc) => {
        data.push({ ...doc.data(), id: doc.id });
      });
      setMessages(data);
    });
    return () => unsubscribe();
  }, []);

  const handleSend = async () => {
    if (text.length > 0) {
      try {
        await addDoc(collection(db, "chat"), {
          content: text,
          createdAt: serverTimestamp(),
        });
        setText('');
        setDialogVisible(false);
      } catch (error) {
        console.error("傳送失敗:", error);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Firebase 即時留言板</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.msgBox}>
            <Text style={styles.msgText}>{item.content}</Text>
          </View>
        )}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setDialogVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>
      <FABDialog
        visible={dialogVisible}
        onClose={() => setDialogVisible(false)}
        text={text}
        setText={setText}
        onSend={handleSend}
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 20,
    textAlign: 'center',
    color: '#333',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 36,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4630EB',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  msgBox: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    borderLeftWidth: 4,
    borderLeftColor: '#4630EB',
  },
  msgText: {
    fontSize: 16,
    color: '#444',
  },
});