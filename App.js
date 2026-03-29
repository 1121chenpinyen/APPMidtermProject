import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Button, FlatList, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// 匯入你建立的 firebaseConfig.js (請確定檔案名稱與路徑正確)
import { db } from './firebaseConfig'; 
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';

export default function App() {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);

  // --- 核心 A：即時監聽雲端資料 ---
  useEffect(() => {
    // 建立查詢：指向 "chat" 資料夾，按時間排序
    const q = query(collection(db, "chat"), orderBy("createdAt", "desc"));
    
    // 開啟監聽：只要 Firebase 雲端資料有變動，這裡就會立刻觸發
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = [];
      querySnapshot.forEach((doc) => {
        data.push({ ...doc.data(), id: doc.id });
      });
      setMessages(data); 
    });

    return () => unsubscribe(); // 卸載時停止監聽
  }, []);

  // --- 核心 B：傳送資料到 Firebase ---
  const handleSend = async () => {
    if (text.length > 0) {
      try {
        await addDoc(collection(db, "chat"), {
          content: text,
          createdAt: serverTimestamp(), // 使用伺服器時間更準確
        });
        setText(''); // 成功後清空輸入框
      } catch (error) {
        console.error("傳送失敗:", error);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Firebase 即時留言板</Text>
      
      <View style={styles.inputArea}>
        <TextInput 
          style={styles.input} 
          value={text} 
          onChangeText={setText} 
          placeholder="想說什麼嗎？" 
        />
        <Button title="傳送" onPress={handleSend} />
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.msgBox}>
            <Text style={styles.msgText}>{item.content}</Text>
          </View>
        )}
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
  inputArea: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 5,
    marginRight: 10,
  },
  msgBox: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    // 加上一點陰影讓它像卡片
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    borderLeftWidth: 4,
    borderLeftColor: '#4630EB', // Expo 經典紫色
  },
  msgText: {
    fontSize: 16,
    color: '#444',
  },
});